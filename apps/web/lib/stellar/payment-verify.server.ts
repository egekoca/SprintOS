import { Horizon } from "@stellar/stellar-sdk";
import { NETWORK, USDC_ASSET_CODE, USDC_ISSUER } from "./config";
import { withTimeout } from "../with-timeout";

const HORIZON_TIMEOUT_MS = 10_000;

/**
 * Read a classic Stellar payment back from the network.
 *
 * Plus activation is the one place this application still moves money
 * through a plain Stellar payment rather than a Soroban contract call —
 * there is no "Plus" asset or subscription contract, just a wallet paying
 * the going rate in USDC. This reads that payment back from Horizon rather
 * than trusting a client's claim that it happened, the same discipline the
 * settlement activity index applies to contract calls.
 */

export interface VerifiedUsdcPayment {
  from: string;
  to: string;
  amount: string;
  at: string;
}

function horizon(): Horizon.Server {
  return new Horizon.Server(NETWORK.horizonUrl, { allowHttp: NETWORK.horizonUrl.startsWith("http://") });
}

/**
 * Null when the transaction does not exist, did not succeed, or carries no
 * payment of this deployment's configured USDC asset.
 */
export async function verifyUsdcPayment(txHash: string): Promise<VerifiedUsdcPayment | null> {
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
    (op): op is Horizon.ServerApi.PaymentOperationRecord =>
      op.type === "payment" &&
      (op as Horizon.ServerApi.PaymentOperationRecord).asset_type !== "native" &&
      (op as Horizon.ServerApi.PaymentOperationRecord).asset_code === USDC_ASSET_CODE &&
      (op as Horizon.ServerApi.PaymentOperationRecord).asset_issuer === USDC_ISSUER,
  );
  if (!payment) return null;

  return { from: payment.from, to: payment.to, amount: payment.amount, at: tx.created_at };
}
