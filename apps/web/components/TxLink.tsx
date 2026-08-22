import { explorerTx } from "@/lib/stellar/config";

/**
 * A settled transaction, shown as its hash and a link out.
 *
 * Every state change in SprintOS ends here. The Statement of Work asks for
 * transaction hashes and explorer links as evidence, so the interface surfaces
 * them everywhere rather than burying them in a receipt page.
 */
export function TxLink({ hash, label = "View on Stellar Expert" }: { hash: string; label?: string }) {
  return (
    <span className="row" style={{ gap: "0.5rem" }}>
      <code className="mono" style={{ fontSize: "0.75rem", color: "var(--chalk-dim)" }}>
        {hash.slice(0, 10)}…{hash.slice(-6)}
      </code>
      <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="badge-link">
        {label} ↗
      </a>
    </span>
  );
}
