"use client";

import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { NETWORK, TREASURY_ADDRESS } from "./config";
import { signTransaction } from "./wallet";
import type { PaymentAsset } from "./payment-assets";

/**
 * Pay for SprintOS Plus or Pro with a plain Stellar payment.
 *
 * This is the one place in the app that moves money through a classic
 * payment rather than a Soroban contract call — there is no subscription
 * contract, just a wallet paying the going rate in one of a few accepted
 * assets. Built, simulated nowhere, and handed straight to the connected
 * wallet to sign: the same "the app prepares, the wallet decides" shape
 * every other write in this codebase already follows.
 */
export async function payForPlan(payer: string, asset: PaymentAsset, tier: "plus" | "pro"): Promise<string> {
  if (!TREASURY_ADDRESS) throw new Error("This deployment is not configured to sell Plus or Pro yet.");

  const horizon = new Horizon.Server(NETWORK.horizonUrl, { allowHttp: NETWORK.horizonUrl.startsWith("http://") });
  const account = await horizon.loadAccount(payer);

  const stellarAsset = asset.issuer ? new Asset(asset.code, asset.issuer) : Asset.native();
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(
      Operation.payment({ destination: TREASURY_ADDRESS, asset: stellarAsset, amount: asset.price[tier] }),
    )
    .setTimeout(60)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), payer);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase);
  const result = await horizon.submitTransaction(signed);
  return result.hash;
}
