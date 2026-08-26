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

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  url: string;
}

/**
 * Why a connection could not be completed, in a form the interface can act on.
 *
 * A bare message like "switch to testnet" tells someone what is wrong without
 * telling them what to do about it. These carry enough for the screen to offer
 * the actual next step — install links, or the name of the network the wallet
 * is currently on.
 */
export type WalletProblem =
  | { kind: "no-wallet"; options: WalletOption[] }
  | { kind: "wrong-network"; current: string; walletName: string };

export class WalletProblemError extends Error {
  readonly problem: WalletProblem;
  constructor(problem: WalletProblem, message: string) {
    super(message);
    this.name = "WalletProblemError";
    this.problem = problem;
  }
}

/** Every wallet the kit knows about, and whether it is installed right now. */
export async function detectWallets(): Promise<{ available: WalletOption[]; all: WalletOption[] }> {
  const { StellarWalletsKit } = await ensureInit();
  const wallets = await StellarWalletsKit.refreshSupportedWallets();
  const toOption = (wallet: { id: string; name: string; icon: string; url: string }): WalletOption => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
    url: wallet.url,
  });
  return {
    available: wallets.filter((wallet) => wallet.isAvailable).map(toOption),
    all: wallets.map(toOption),
  };
}

/** Which Stellar network the connected wallet is pointed at, if any. */
export async function currentNetwork(): Promise<{ passphrase: string; isTestnet: boolean } | null> {
  const { StellarWalletsKit, Networks } = await ensureInit();
  try {
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();
    return { passphrase: networkPassphrase, isTestnet: networkPassphrase === Networks.TESTNET };
  } catch {
    return null;
  }
}

/**
 * Read a message off whatever the kit threw.
 *
 * The wallets kit rejects with a plain object — `{ code: -1, message: "The
 * user closed the modal." }` — not an Error. `String(err)` on that yields
 * "[object Object]", so the dismissal check never matched and simply closing
 * the picker was reported to the user as a failure to reach their wallet.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** The kit signals a closed picker with code -1; treat that as "never mind". */
function isDismissal(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === -1) return true;
  return /clos|cancel|dismiss|reject|denied/i.test(errorMessage(err));
}

/** Turn a passphrase into something a person recognises. */
function networkName(passphrase: string): string {
  if (passphrase.startsWith("Public Global Stellar Network")) return "Stellar mainnet";
  if (passphrase.startsWith("Test SDF Network")) return "Stellar testnet";
  if (passphrase.startsWith("Test SDF Future Network")) return "Stellar futurenet";
  return "another network";
}

/**
 * Open the wallet picker and connect.
 *
 * Resolves null when the user closes the modal without choosing — a dismissal
 * is not an error and should not be reported as one.
 *
 * Connecting deliberately does NOT require the wallet to be on testnet. An
 * address is a keypair and is the same on every network; the app reads the
 * ledger through its own testnet RPC, not through the wallet; and every
 * signature this codebase requests carries an explicit testnet passphrase, so
 * a transaction signed here can only ever be valid on testnet. Blocking the
 * connection was therefore stopping people for no reason it could justify —
 * the network only matters at the moment of signing, and that is where it is
 * now checked.
 */
export async function connectWallet(): Promise<ConnectedWallet | null> {
  const { StellarWalletsKit } = await ensureInit();

  const { available, all } = await detectWallets();
  if (available.length === 0) {
    throw new WalletProblemError(
      { kind: "no-wallet", options: all },
      "No Stellar wallet is installed in this browser.",
    );
  }

  try {
    const { address } = await StellarWalletsKit.authModal();
    return address ? { address } : null;
  } catch (err) {
    if (err instanceof WalletProblemError) throw err;
    if (isDismissal(err)) return null;
    throw new Error(errorMessage(err));
  }
}

/**
 * Sign a transaction envelope.
 *
 * The wallet shows the user exactly what they are authorizing and they approve
 * it themselves. Nothing in this codebase can sign on their behalf.
 *
 * The testnet passphrase is passed explicitly, so the wallet is being asked for
 * a testnet signature no matter which network its own UI happens to be showing.
 * Some wallets honour that and sign; others refuse until their selected network
 * matches. Rather than pre-emptively blocking everyone, this asks first and
 * only explains if the wallet actually objects — and by then it can say which
 * wallet, which network, and what to change.
 */
export async function signTransaction(xdr: string, address: string): Promise<string> {
  const { StellarWalletsKit, Networks } = await ensureInit();
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase: Networks.TESTNET,
    });
    return signedTxXdr;
  } catch (err) {
    if (isDismissal(err)) throw new Error("You declined the signature in your wallet.");

    /* Only reach for the network explanation once signing has genuinely
       failed, and only when the wallet really is pointed elsewhere. */
    const network = await currentNetwork();
    if (network && !network.isTestnet) {
      const walletName = StellarWalletsKit.selectedModule?.productName ?? "Your wallet";
      throw new WalletProblemError(
        { kind: "wrong-network", current: networkName(network.passphrase), walletName },
        `${walletName} would not sign a testnet transaction while it is set to ${networkName(network.passphrase)}.`,
      );
    }
    throw new Error(errorMessage(err));
  }
}

export async function disconnectWallet(): Promise<void> {
  if (!initialized) return;
  const { StellarWalletsKit } = await ensureInit();
  await StellarWalletsKit.disconnect().catch(() => undefined);
}
