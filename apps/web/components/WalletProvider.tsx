"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { connectWallet, disconnectWallet } from "@/lib/stellar/wallet";

interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

const STORAGE_KEY = "sprintos.address";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await connectWallet();
      if (result) {
        setAddress(result.address);
        try {
          window.localStorage.setItem(STORAGE_KEY, result.address);
        } catch { /* not fatal */ }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach a wallet. Install Freighter, or unlock the one you have.",
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setAddress(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* not fatal */ }
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, connect, disconnect }),
    [address, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside a WalletProvider.");
  return ctx;
}
