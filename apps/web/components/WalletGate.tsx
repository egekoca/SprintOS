"use client";

import { useWallet } from "./WalletProvider";
import { FoxSpinner } from "./FoxLoader";
import { ProductIcon } from "./ProductIcon";

/**
 * The one place the app asks for a wallet, and helps when it cannot get one.
 *
 * Every desk previously showed a "Connect wallet" button and, on failure, a
 * sentence. "Switch the selected wallet to Stellar testnet, then connect
 * again" states the problem and leaves the person to solve it alone — with no
 * indication of which wallet, which network it is actually on, or where the
 * setting lives.
 *
 * The only obstacle worth a whole screen is having no wallet at all: the kit
 * knows every wallet it supports and whether each is present, so offer the real
 * install links instead of naming one.
 *
 * Being on another network is deliberately NOT a gate here — connecting does
 * not need testnet, so that is a banner elsewhere rather than a wall.
 */
export function WalletGate({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const { connect, connecting, error, problem } = useWallet();

  return (
    <section className="shell desk-gate">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="lede">{children}</p>

      {problem?.kind === "no-wallet" ? (
        <div className="wallet-help">
          <p className="wallet-help-title">
            <ProductIcon name="wallet" size={18} /> No Stellar wallet found in this browser
          </p>
          <p className="wallet-help-note">
            Install one of these, then come back and connect. Any of them works — SprintOS never
            sees your keys either way.
          </p>
          <ul className="wallet-options">
            {problem.options.map((option) => (
              <li key={option.id}>
                <a href={option.url} target="_blank" rel="noreferrer">
                  {option.icon && <img src={option.icon} alt="" width={22} height={22} />}
                  <span>{option.name}</span>
                  <b>Install ↗</b>
                </a>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost" onClick={connect} disabled={connecting}>
            {connecting ? <><FoxSpinner /> Checking…</> : "I installed one — try again"}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? <><FoxSpinner /> Connecting…</> : <><ProductIcon name="wallet" size={18} /> Connect wallet</>}
          </button>
          {error && <p className="wallet-help-note">{error}</p>}
        </>
      )}
    </section>
  );
}
