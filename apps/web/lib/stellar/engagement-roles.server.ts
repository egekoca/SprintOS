import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { FIRST_ENGAGEMENT_ID, LEGACY_SETTLEMENT_CONTRACT_ID, NETWORK, SETTLEMENT_CONTRACT_ID } from "./config";
import { withTimeout } from "../with-timeout";

const RPC_TIMEOUT_MS = 10_000;

/**
 * A minimal, server-only read of who may decide an engagement, for API routes
 * that need to check a caller's role without pulling in `contract.ts` — which
 * is marked `"use client"` because it also holds the wallet write path.
 *
 * This duplicates a small slice of `contract.ts`'s decoding on purpose rather
 * than importing it, matching the activity index route's own self-contained
 * style: a server route should not depend on a client-only module to do a
 * read that never touches a wallet.
 */

const READ_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function server() {
  return new rpc.Server(NETWORK.rpcUrl, { allowHttp: NETWORK.rpcUrl.startsWith("http://") });
}

function contractIdFor(id: bigint): string {
  if (LEGACY_SETTLEMENT_CONTRACT_ID && id < BigInt(FIRST_ENGAGEMENT_ID)) return LEGACY_SETTLEMENT_CONTRACT_ID;
  return SETTLEMENT_CONTRACT_ID;
}

function asAddress(value: unknown): string {
  return value instanceof Address ? value.toString() : String(value);
}

export interface EngagementRoles {
  sponsor: string;
  builder: string;
  reviewers: string[];
}

/** Null when the engagement does not exist or the network could not be read. */
export async function engagementRoles(engagementId: string): Promise<EngagementRoles | null> {
  let id: bigint;
  try {
    id = BigInt(engagementId);
  } catch {
    return null;
  }

  const source = new Account(READ_SOURCE, "0");
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(new Contract(contractIdFor(id)).call("get_engagement", nativeToScVal(id, { type: "u64" })))
    .setTimeout(30)
    .build();

  let sim: rpc.Api.SimulateTransactionResponse;
  try {
    sim = await withTimeout(
      server().simulateTransaction(tx),
      RPC_TIMEOUT_MS,
      `The Stellar RPC did not answer within ${RPC_TIMEOUT_MS / 1000} seconds.`,
    );
  } catch {
    return null;
  }
  if (rpc.Api.isSimulationError(sim) || !sim.result?.retval) return null;

  const raw = scValToNative(sim.result.retval) as Record<string, unknown>;
  const many = raw.reviewers;
  const one = raw.reviewer;
  const reviewers = Array.isArray(many)
    ? many.map(asAddress)
    : one !== undefined && one !== null
      ? [asAddress(one)]
      : [];

  return { sponsor: asAddress(raw.sponsor), builder: asAddress(raw.builder), reviewers };
}

/** Whether this address may decide this engagement — the sponsor, or anyone they authorised. The builder never may. */
export function canDecideRole(roles: EngagementRoles, address: string): boolean {
  if (address === roles.builder) return false;
  return address === roles.sponsor || roles.reviewers.includes(address);
}
