"use client";

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
let kitPromise: ReturnType<typeof importWalletKit> | null = null;

/**
 * The kit writes its theme variables to `document.documentElement` as soon as
 * its module is evaluated. A static import therefore changes the root `<html>`
 * before React hydrates and produces a server/client attribute mismatch.
 * Loading it on the first wallet action keeps the initial DOM deterministic
 * and also avoids shipping wallet UI code to visitors who only read the site.
 */
async function importWalletKit() {
  const [kit, freighter, xbull, albedo, lobstr, hana, rabet] = await Promise.all([
    import("@creit-tech/stellar-wallets-kit"),
    import("@creit-tech/stellar-wallets-kit/modules/freighter"),
    import("@creit-tech/stellar-wallets-kit/modules/xbull"),
    import("@creit-tech/stellar-wallets-kit/modules/albedo"),
    import("@creit-tech/stellar-wallets-kit/modules/lobstr"),
    import("@creit-tech/stellar-wallets-kit/modules/hana"),
    import("@creit-tech/stellar-wallets-kit/modules/rabet"),
  ]);
  return { kit, freighter, xbull, albedo, lobstr, hana, rabet };
}

async function ensureInit() {
  kitPromise ??= importWalletKit();
  const modules = await kitPromise;
  if (initialized) return modules.kit;

  const { StellarWalletsKit, Networks } = modules.kit;
  StellarWalletsKit.init({
    // Testnet is pinned here as well as in config. Mainnet is out of scope for
    // this engagement, and there is no switch to flip by accident.
    network: Networks.TESTNET,
    selectedWalletId: modules.freighter.FREIGHTER_ID,
    modules: [
      new modules.freighter.FreighterModule(),
      new modules.xbull.xBullModule(),
      new modules.albedo.AlbedoModule(),
      new modules.lobstr.LobstrModule(),
      new modules.hana.HanaModule(),
      new modules.rabet.RabetModule(),
    ],
  });
  initialized = true;
  return modules.kit;
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
  const { StellarWalletsKit, Networks } = await ensureInit();
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
  const { StellarWalletsKit, Networks } = await ensureInit();
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
  const { StellarWalletsKit } = await ensureInit();
  await StellarWalletsKit.disconnect().catch(() => undefined);
}
