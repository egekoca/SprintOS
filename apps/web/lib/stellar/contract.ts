"use client";

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  ENGAGEMENT_STATUSES,
  MILESTONE_STATUSES,
  decodeStatus,
  type EngagementStatus,
  type MilestoneStatus,
} from "./status.ts";
import { NETWORK, SETTLEMENT_CONTRACT_ID } from "./config.ts";
import { signTransaction } from "./wallet.ts";

/**
 * Client for the settlement contract.
 *
 * Read paths simulate and never touch a wallet. Write paths build, simulate,
 * hand the envelope to the user's wallet for signature, and submit. The gap
 * between those two is the whole point: nothing on a read path can move value,
 * and every write path stops at a human.
 */

const server = new rpc.Server(NETWORK.rpcUrl, { allowHttp: NETWORK.rpcUrl.startsWith("http://") });

export type { MilestoneStatus, EngagementStatus } from "./status.ts";

export interface Milestone {
  title: string;
  criteria_hash: string;
  amount: bigint;
  deadline: bigint;
  status: MilestoneStatus;
  evidence_hash: string | null;
  evidence_uri: string | null;
  submitted_at: bigint;
  decided_at: bigint;
}

export interface Engagement {
  id: bigint;
  sponsor: string;
  builder: string;
  reviewer: string;
  token: string;
  total_amount: bigint;
  status: EngagementStatus;
  created_at: bigint;
  milestones: Milestone[];
}

export type Role = "sponsor" | "builder" | "reviewer" | "observer";

/**
 * Which role an address plays in an engagement.
 *
 * This is the entire authorization model of the web app: no accounts, no
 * passwords, no sessions. What you may do follows from which key you hold, and
 * the contract independently enforces the same thing — the UI hiding a button
 * is a convenience, not the control.
 */
export function roleOf(engagement: Engagement, address: string | null): Role {
  if (!address) return "observer";
  if (address === engagement.sponsor) return "sponsor";
  if (address === engagement.builder) return "builder";
  if (address === engagement.reviewer) return "reviewer";
  return "observer";
}

function contract(): Contract {
  return new Contract(SETTLEMENT_CONTRACT_ID);
}

function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Turn the raw contract value into the shape the UI works with. */
function toEngagement(raw: any): Engagement {
  return {
    id: BigInt(raw.id),
    sponsor: raw.sponsor instanceof Address ? raw.sponsor.toString() : String(raw.sponsor),
    builder: String(raw.builder),
    reviewer: String(raw.reviewer),
    token: String(raw.token),
    total_amount: BigInt(raw.total_amount),
    status: decodeStatus(raw.status, ENGAGEMENT_STATUSES),
    created_at: BigInt(raw.created_at),
    milestones: (raw.milestones ?? []).map(toMilestone),
  };
}

function toMilestone(raw: any): Milestone {
  return {
    title: String(raw.title),
    criteria_hash: bytesToHex(raw.criteria_hash),
    amount: BigInt(raw.amount),
    deadline: BigInt(raw.deadline),
    status: decodeStatus(raw.status, MILESTONE_STATUSES),
    evidence_hash: raw.evidence_hash ? bytesToHex(raw.evidence_hash) : null,
    evidence_uri: raw.evidence_uri ? String(raw.evidence_uri) : null,
    submitted_at: BigInt(raw.submitted_at),
    decided_at: BigInt(raw.decided_at),
  };
}

/**
 * Read a contract value by simulating the call.
 *
 * A dummy source account is used because simulation never submits anything and
 * never asks anyone to sign.
 */
/* The all-zero ed25519 account. A strkey is exactly 56 characters; this one
   was written with twelve extra padding characters, so `new Account()`
   rejected it and every contract read in the app failed with "accountId is
   invalid" — surfacing as an empty ledger rather than as an error. */
const READ_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * How long to wait on the RPC before giving up.
 *
 * Without this a slow or unreachable node leaves every read screen on its
 * loading state forever, with nothing to retry and nothing to report. A
 * rejected promise at least reaches the error path the screens already have.
 */
const READ_TIMEOUT_MS = 15_000;

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function simulateRead<T>(method: string, args: xdr.ScVal[]): Promise<T> {
  /* No account lookup. Simulation never submits, so the sequence number is
     never checked — and this placeholder account has never been funded, so
     fetching it was a guaranteed 404 in front of every single read. Listing
     engagements paid that round-trip once per engagement plus once more. */
  const source = new Account(READ_SOURCE, "0");

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await withTimeout(
    server.simulateTransaction(tx),
    READ_TIMEOUT_MS,
    `The Stellar RPC did not answer within ${READ_TIMEOUT_MS / 1000} seconds.`,
  );
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(decodeContractError(sim.error));
  }
  if (!sim.result?.retval) throw new Error(`${method} returned nothing.`);
  return scValToNative(sim.result.retval) as T;
}

export async function getEngagement(id: bigint | number): Promise<Engagement> {
  const raw = await simulateRead<any>("get_engagement", [nativeToScVal(BigInt(id), { type: "u64" })]);
  return toEngagement(raw);
}

export async function getEngagementCount(): Promise<number> {
  const raw = await simulateRead<bigint>("engagement_count", []);
  return Number(raw);
}

export async function getBalance(id: bigint | number): Promise<bigint> {
  return BigInt(await simulateRead<bigint>("get_balance", [nativeToScVal(BigInt(id), { type: "u64" })]));
}

export async function listEngagements(): Promise<Engagement[]> {
  const count = await getEngagementCount();
  const ids = Array.from({ length: count }, (_, i) => i);
  const results = await Promise.allSettled(ids.map((i) => getEngagement(i)));
  return results
    .filter((r): r is PromiseFulfilledResult<Engagement> => r.status === "fulfilled")
    .map((r) => r.value)
    .reverse();
}

/** Map a contract error code back to something a person can act on. */
const ERROR_MESSAGES: Record<number, string> = {
  1: "This contract has already been initialized.",
  2: "This contract has not been initialized.",
  3: "No engagement with that id exists.",
  4: "No milestone at that index.",
  5: "That action belongs to a different role. Check which wallet is connected.",
  6: "The milestone is not in a state where that action is allowed.",
  7: "This milestone has already been released.",
  8: "The engagement has not been funded yet.",
  9: "The engagement is already funded.",
  10: "The deadline has not passed yet, so this milestone cannot be reclaimed.",
  11: "Milestone amounts must be greater than zero.",
  12: "The milestone amounts do not add up to the funded total.",
  13: "An engagement can hold at most three milestones.",
  14: "An engagement needs at least one milestone.",
  15: "The deadline must be in the future.",
  16: "The sponsor, builder and reviewer must be three different addresses.",
  17: "The requested amounts are too large.",
  18: "Milestone titles must contain 1–200 bytes.",
  19: "Evidence pointers must contain 1–2048 bytes.",
};

export function decodeContractError(error: unknown): string {
  const text = typeof error === "string" ? error : JSON.stringify(error ?? "");
  const match = text.match(/Error\(Contract,\s*#(\d+)\)/);
  if (match?.[1]) {
    const code = Number(match[1]);
    return ERROR_MESSAGES[code] ?? `The contract refused this call (error #${code}).`;
  }
  if (/UnreachableCodeReached|InvalidAction|auth/i.test(text)) {
    return "The transaction was not authorized by the required wallet.";
  }
  return text.slice(0, 300) || "The transaction failed.";
}

export interface SubmittedTx {
  hash: string;
  result?: unknown;
}

/**
 * Build, simulate, hand to the wallet, submit.
 *
 * The signature step is deliberately not abstracted away: the user sees what
 * they are approving in their own wallet, and this function cannot proceed
 * without it.
 */
async function invoke(
  address: string,
  method: string,
  args: xdr.ScVal[],
): Promise<SubmittedTx> {
  const account = await server.getAccount(address);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(120)
    .build();

  const prepared = await server.prepareTransaction(built).catch((err) => {
    throw new Error(decodeContractError(err?.message ?? err));
  });

  const signedXdr = await signTransaction(prepared.toXDR(), address);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error(decodeContractError(sent.errorResult?.toXDR("base64") ?? "submission failed"));
  }

  // Poll until the ledger closes on it.
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash: sent.hash,
        result: result.returnValue ? scValToNative(result.returnValue) : undefined,
      };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(decodeContractError(result.resultXdr?.toXDR("base64") ?? "transaction failed"));
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The transaction did not confirm in time. Check the explorer before retrying.");
}

const u64 = (v: bigint | number) => nativeToScVal(BigInt(v), { type: "u64" });
const u32 = (v: number) => nativeToScVal(v, { type: "u32" });
const addr = (v: string) => new Address(v).toScVal();

function hashToScVal(hex: string): xdr.ScVal {
  const clean = hex.startsWith("sha256:") ? hex.slice(7) : hex;
  if (!/^[0-9a-f]{64}$/i.test(clean)) {
    throw new Error("Expected a 32-byte hexadecimal document hash.");
  }
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return xdr.ScVal.scvBytes(Buffer.from(bytes));
}

export interface MilestoneDraft {
  title: string;
  criteriaHash: string;
  amount: bigint;
  deadline: number;
}

// ------------------------------------------------------------ sponsor

export async function createEngagement(
  sponsor: string,
  builder: string,
  reviewer: string,
  milestones: MilestoneDraft[],
): Promise<SubmittedTx & { engagementId: bigint }> {
  const list = xdr.ScVal.scvVec(
    milestones.map((m) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: nativeToScVal("amount", { type: "symbol" }), val: nativeToScVal(m.amount, { type: "i128" }) }),
        new xdr.ScMapEntry({ key: nativeToScVal("criteria_hash", { type: "symbol" }), val: hashToScVal(m.criteriaHash) }),
        new xdr.ScMapEntry({ key: nativeToScVal("deadline", { type: "symbol" }), val: u64(m.deadline) }),
        new xdr.ScMapEntry({ key: nativeToScVal("title", { type: "symbol" }), val: nativeToScVal(m.title, { type: "string" }) }),
      ]),
    ),
  );
  const tx = await invoke(sponsor, "create_engagement", [addr(sponsor), addr(builder), addr(reviewer), list]);
  if (typeof tx.result !== "bigint") {
    throw new Error(
      "The engagement was created, but its id could not be decoded. Use the transaction link to recover it.",
    );
  }
  return { ...tx, engagementId: tx.result };
}

export const fundEngagement = (sponsor: string, id: bigint | number) =>
  invoke(sponsor, "fund", [u64(id)]);

export const refundMilestone = (sponsor: string, id: bigint | number, idx: number) =>
  invoke(sponsor, "refund", [u64(id), u32(idx)]);

// ------------------------------------------------------------ builder

export const submitEvidence = (
  builder: string,
  id: bigint | number,
  idx: number,
  evidenceHash: string,
  evidenceUri: string,
) => invoke(builder, "submit_evidence", [u64(id), u32(idx), hashToScVal(evidenceHash), nativeToScVal(evidenceUri, { type: "string" })]);

export const claimApprovedMilestone = (builder: string, id: bigint | number, idx: number) =>
  invoke(builder, "claim", [u64(id), u32(idx)]);

// ----------------------------------------------------------- reviewer

export const approveMilestone = (reviewer: string, id: bigint | number, idx: number) =>
  invoke(reviewer, "approve", [u64(id), u32(idx)]);

export const holdMilestone = (reviewer: string, id: bigint | number, idx: number) =>
  invoke(reviewer, "hold", [u64(id), u32(idx)]);

export const releaseMilestone = (reviewer: string, id: bigint | number, idx: number) =>
  invoke(reviewer, "release", [u64(id), u32(idx)]);
