import { NextResponse } from "next/server";
import { Address, Transaction, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { ActivityAction, ActivityEntry } from "@sprintos/schemas";
import { NETWORK, SETTLEMENT_CONTRACT_ID } from "@/lib/stellar/config";
import { appendActivity, store, validateEngagementId } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";

/**
 * The settlement transaction index.
 *
 * The contract records milestone state but not the transaction that produced
 * it, and the Statement of Work asks the interface to show transaction hashes
 * and explorer links. This route keeps that index — and refuses to take the
 * client's word for any of it.
 *
 * Everything that matters is read back from the network: the transaction must
 * exist, must have succeeded, must have invoked *this* settlement contract, and
 * the action, the signer and the milestone it refers to are decoded from the
 * envelope rather than accepted from the caller. A hostile POST can therefore
 * add nothing that did not really happen on chain.
 */
export const runtime = "nodejs";

const server = () =>
  new rpc.Server(NETWORK.rpcUrl, { allowHttp: NETWORK.rpcUrl.startsWith("http://") });

/** Contract method name to the word the log uses. */
const ACTIONS: Record<string, ActivityAction> = {
  create_engagement: "created",
  fund: "funded",
  submit_evidence: "evidence_submitted",
  approve: "approved",
  hold: "held",
  release: "released",
  claim: "claimed",
  refund: "refunded",
};

interface OnChainCall {
  method: string;
  contractId: string;
  args: unknown[];
  source: string;
}

/** Pull the single contract invocation out of a confirmed transaction. */
function readInvocation(envelopeXdr: string): OnChainCall | null {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(envelopeXdr, NETWORK.passphrase);
  } catch {
    return null;
  }
  /* A fee-bump wrapper carries no operations of its own; the settlement app
     never builds one, so anything that is not a plain transaction is refused. */
  if (!(tx instanceof Transaction) || tx.operations.length !== 1) return null;
  const op = tx.operations[0];
  if (!op || op.type !== "invokeHostFunction") return null;

  let invoke;
  try {
    invoke = op.func.invokeContract();
  } catch {
    return null;
  }

  return {
    method: invoke.functionName().toString(),
    contractId: Address.fromScAddress(invoke.contractAddress()).toString(),
    args: invoke.args().map((arg: xdr.ScVal) => {
      try {
        return scValToNative(arg);
      } catch {
        return undefined;
      }
    }),
    source: tx.source,
  };
}

export async function GET(request: Request) {
  const engagementId = new URL(request.url).searchParams.get("engagement_id");
  if (!engagementId) {
    return NextResponse.json({ error: "Send the engagement id." }, { status: 400 });
  }
  try {
    validateEngagementId(engagementId);
  } catch {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }
  const log = await store.getActivity(engagementId);
  return NextResponse.json({ entries: log?.entries ?? [] });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`activity:${requestClientKey(request)}`, 60).allowed) {
    return NextResponse.json({ error: "Too many writes. Try again later." }, { status: 429 });
  }

  let body: { tx_hash?: unknown; engagement_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const txHash = typeof body.tx_hash === "string" ? body.tx_hash.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Expected a 32-byte hexadecimal transaction hash." }, { status: 400 });
  }

  let confirmed;
  try {
    confirmed = await server().getTransaction(txHash);
  } catch {
    return NextResponse.json({ error: "The network could not be reached." }, { status: 503 });
  }
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    return NextResponse.json(
      { error: "Only a confirmed, successful transaction can be recorded." },
      { status: 409 },
    );
  }

  const call = readInvocation(confirmed.envelopeXdr.toXDR("base64"));
  if (!call) {
    return NextResponse.json({ error: "That transaction is not a contract invocation." }, { status: 409 });
  }
  if (call.contractId !== SETTLEMENT_CONTRACT_ID) {
    return NextResponse.json({ error: "That transaction did not call this settlement contract." }, { status: 409 });
  }

  const action = ACTIONS[call.method];
  if (!action) {
    return NextResponse.json({ error: "That contract call does not change settlement state." }, { status: 409 });
  }

  /* Every method but creation carries its engagement id, and the milestone
     methods carry the index too, so both are read from the ledger rather than
     from the caller. Creation returns its id instead of taking one, so there
     the sponsor's own claim is all there is. */
  const [firstArg, secondArg] = call.args;
  const engagementId =
    action === "created"
      ? String(body.engagement_id ?? "")
      : typeof firstArg === "bigint"
        ? firstArg.toString()
        : "";
  const milestoneIdx =
    action !== "created" && action !== "funded" && typeof secondArg === "number" ? secondArg : undefined;

  let entry;
  try {
    validateEngagementId(engagementId);
    entry = ActivityEntry.parse({
      engagement_id: engagementId,
      ...(milestoneIdx === undefined ? {} : { milestone_idx: milestoneIdx }),
      action,
      tx_hash: txHash,
      actor: call.source,
      /* The ledger's own timestamp, not the browser's clock. */
      at: new Date(confirmed.createdAt * 1000).toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The transaction could not be recorded." },
      { status: 400 },
    );
  }

  try {
    const log = await appendActivity(entry);
    return NextResponse.json({ entries: log.entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The transaction could not be recorded." },
      { status: 500 },
    );
  }
}
