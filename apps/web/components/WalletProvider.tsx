"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  connectWallet,
  currentNetwork,
  disconnectWallet,
  WalletProblemError,
  type WalletProblem,
} from "@/lib/stellar/wallet";

interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  /** Set when the obstacle is something the screen can help with. */
  problem: WalletProblem | null;
  /**
   * True when the wallet is connected but pointed at a network other than the
   * one this deployment is configured for (testnet or mainnet). This is a
   * warning, not a gate — everything except signing works regardless.
   */
  offDeploymentNetwork: boolean;
  connect: () => Promise<void>;
  /** Re-read the wallet's network after the user changed it themselves. */
  recheck: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

const STORAGE_KEY = "sprintos.address";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<WalletProblem | null>(null);
  const [offDeploymentNetwork, setOffDeploymentNetwork] = useState(false);

  // Remember the address so a refresh does not drop the reviewer out of a
  // half-finished review. This is a display convenience only — the wallet
  // still has to sign every action, and nothing is trusted from storage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setAddress(saved);
    } catch {
      /* private browsing or blocked storage — connect manually */
    }
  }, []);

  const remember = useCallback((next: string) => {
    setAddress(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch { /* not fatal */ }
  }, []);

  /* Informational only. Signing passes this deployment's own passphrase
     explicitly, so this never blocks anything — it just lets the interface
     warn early rather than letting someone reach the signature and be
     surprised. */
  const recheck = useCallback(async () => {
    const network = await currentNetwork();
    setOffDeploymentNetwork(Boolean(network && !network.matchesDeployment));
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setProblem(null);
    try {
      const result = await connectWallet();
      if (result) {
        remember(result.address);
        void recheck();
      }
    } catch (err) {
      if (err instanceof WalletProblemError) setProblem(err.problem);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach a wallet. Install one, or unlock the one you have.",
      );
    } finally {
      setConnecting(false);
    }
  }, [remember, recheck]);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setAddress(null);
    setProblem(null);
    setError(null);
    setOffDeploymentNetwork(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* not fatal */ }
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, problem, offDeploymentNetwork, connect, recheck, disconnect }),
    [address, connecting, error, problem, offDeploymentNetwork, connect, recheck, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside a WalletProvider.");
  return ctx;
}
