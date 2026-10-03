import { Horizon } from "@stellar/stellar-sdk";
import { NETWORK } from "./config";
import { withTimeout } from "../with-timeout";

const HORIZON_TIMEOUT_MS = 10_000;

/**
 * Read a classic Stellar payment back from the network.
 *
 * Plus and Pro activation are the one place this application still moves
 * money through a plain Stellar payment rather than a Soroban contract call
 * — there is no subscription contract, just a wallet paying the going rate
 * in one of a few accepted assets (see `payment-assets.ts`). This reads that
 * payment back from Horizon rather than trusting a client's claim that it
 * happened, the same discipline the settlement activity index applies to
 * contract calls. It does not itself know which asset is "acceptable" or
 * what it should cost — that is the caller's job, matching the returned
 * asset against `payment-assets.ts`.
 */

export interface VerifiedPayment {
  from: string;
  to: string;
  /** "native" for XLM, otherwise the issued asset's code. */
  assetCode: string;
  /** null for native XLM. */
  assetIssuer: string | null;
  amount: string;
  at: string;
}

function horizon(): Horizon.Server {
  return new Horizon.Server(NETWORK.horizonUrl, { allowHttp: NETWORK.horizonUrl.startsWith("http://") });
}

/**
 * Null when the transaction does not exist, did not succeed, or carries no
 * payment operation at all.
 */
export async function verifyPayment(txHash: string): Promise<VerifiedPayment | null> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return null;
  const server = horizon();
  const timeoutMessage = `Horizon did not answer within ${HORIZON_TIMEOUT_MS / 1000} seconds.`;

  let tx: Horizon.ServerApi.TransactionRecord;
  try {
    tx = await withTimeout(server.transactions().transaction(txHash).call(), HORIZON_TIMEOUT_MS, timeoutMessage);
  } catch {
    return null;
  }
  if (!tx.successful) return null;

  let ops: Horizon.ServerApi.CollectionPage<Horizon.ServerApi.OperationRecord>;
  try {
    ops = await withTimeout(server.operations().forTransaction(txHash).call(), HORIZON_TIMEOUT_MS, timeoutMessage);
  } catch {
    return null;
  }

  const payment = ops.records.find(
    (op): op is Horizon.ServerApi.PaymentOperationRecord => op.type === "payment",
  );
  if (!payment) return null;

  const isNative = payment.asset_type === "native";
  return {
    from: payment.from,
    to: payment.to,
    assetCode: isNative ? "XLM" : (payment.asset_code ?? ""),
    assetIssuer: isNative ? null : (payment.asset_issuer ?? null),
    amount: payment.amount,
    at: tx.created_at,
  };
}
