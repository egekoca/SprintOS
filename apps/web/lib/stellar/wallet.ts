"use client";

import { Networks, StellarWalletsKit } from "@creit-tech/stellar-wallets-kit";
import { FreighterModule, FREIGHTER_ID } from "@creit-tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit-tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit-tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit-tech/stellar-wallets-kit/modules/lobstr";
import { HanaModule } from "@creit-tech/stellar-wallets-kit/modules/hana";
import { RabetModule } from "@creit-tech/stellar-wallets-kit/modules/rabet";

/**
 * Wallet access.
 *
 * Every signature in SprintOS happens here, in the browser, in the user's own
 * wallet. The server has no Stellar secret key, no keypair, and no way to
 * authorize anything — which is how "no custodial wallets, no backend storage
 * of private keys" is satisfied structurally rather than by policy.
 *
 * Modules are listed explicitly rather than pulled in wholesale: the hardware
 * and WalletConnect modules drag in large transitive dependencies this MVP has
 * no use for, and a shorter list is a smaller surface.
 */

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    // Testnet is pinned here as well as in config. Mainnet is out of scope for
    // this engagement, and there is no switch to flip by accident.
    network: Networks.TESTNET,
    selectedWalletId: FREIGHTER_ID,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new LobstrModule(),
      new HanaModule(),
      new RabetModule(),
    ],
  });
  initialized = true;
}

export interface ConnectedWallet {
  address: string;
}

/**
 * Open the wallet picker and connect.
 *
 * Resolves null when the user closes the modal without choosing — a dismissal
 * is not an error and should not be reported as one.
 */
export async function connectWallet(): Promise<ConnectedWallet | null> {
  ensureInit();
  try {
    const { address } = await StellarWalletsKit.authModal();
    if (!address) return null;
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();
    if (networkPassphrase !== Networks.TESTNET) {
      await StellarWalletsKit.disconnect().catch(() => undefined);
      throw new Error("Switch the selected wallet to Stellar testnet, then connect again.");
    }
    return { address };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/clos|cancel|dismiss|reject/i.test(message)) return null;
    throw err;
  }
}

/**
 * Sign a transaction envelope.
 *
 * The wallet shows the user exactly what they are authorizing and they approve
 * it themselves. Nothing in this codebase can sign on their behalf.
 */
export async function signTransaction(xdr: string, address: string): Promise<string> {
  ensureInit();
  const { networkPassphrase } = await StellarWalletsKit.getNetwork();
  if (networkPassphrase !== Networks.TESTNET) {
    throw new Error("The connected wallet is not on Stellar testnet.");
  }
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: Networks.TESTNET,
  });
  return signedTxXdr;
}

export async function disconnectWallet(): Promise<void> {
  if (!initialized) return;
  await StellarWalletsKit.disconnect().catch(() => undefined);
}
