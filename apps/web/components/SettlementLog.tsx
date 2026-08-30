"use client";

import { useEffect, useState } from "react";
import type { ActivityAction, ActivityEntry } from "@sprintos/schemas";
import { explorerAccount, explorerTx, shortAddress } from "@/lib/stellar/config";
import { ProductIcon } from "./ProductIcon";

/**
 * Every settlement transaction for one engagement, in order.
 *
 * The contract records what a milestone's state *is*; it cannot record which
 * transaction put it there. Without this list the hash exists only in the
 * browser tab that signed it, which is exactly the "screenshots and written
 * claims" the Statement of Work asks the public MVP to replace.
 *
 * The index is written by the application but never trusted from it: the server
 * re-reads each transaction from the network and decodes the action, the signer
 * and the milestone from the envelope before storing anything. Every row still
 * carries the explorer link, so a reader never has to believe this table — they
 * can check any line of it in one click.
 */

const LABELS: Record<ActivityAction, string> = {
  created: "Engagement created",
  funded: "Escrow funded",
  evidence_submitted: "Evidence submitted",
  approved: "Approved",
  held: "Held for revision",
  released: "Payment released",
  claimed: "Payment claimed",
  refunded: "Escrow reclaimed",
};

/* The two rows where money actually moved. Worth finding at a glance. */
const SETTLING: ReadonlySet<ActivityAction> = new Set(["released", "claimed", "refunded", "funded"]);

export function SettlementLog({ engagementId }: { engagementId: bigint }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/activity?engagement_id=${engagementId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((body: { entries?: ActivityEntry[] }) => {
        if (live) setEntries(body.entries ?? []);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [engagementId]);

  if (failed) return null;

  return (
    <section className="panel stack-s">
      <p className="eyebrow">Settlement transactions</p>

      {entries === null ? (
        <p className="faint" style={{ fontSize: "0.8125rem" }}>Reading the index…</p>
      ) : entries.length === 0 ? (
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          No transactions have been indexed for this engagement yet. The milestone states above
          still come straight from the ledger.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>What happened</th>
                <th>Milestone</th>
                <th>Signed by</th>
                <th>When</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.tx_hash} className={SETTLING.has(entry.action) ? "log-settling" : undefined}>
                  <td>
                    {SETTLING.has(entry.action) && <ProductIcon name="wallet" size={14} />} {LABELS[entry.action]}
                  </td>
                  <td>{entry.milestone_idx === undefined ? "—" : String(entry.milestone_idx + 1).padStart(2, "0")}</td>
                  <td>
                    <a href={explorerAccount(entry.actor)} target="_blank" rel="noreferrer" className="badge-link">
                      {shortAddress(entry.actor, 4, 4)}
                    </a>
                  </td>
                  <td>{new Date(entry.at).toLocaleString()}</td>
                  <td>
                    <a href={explorerTx(entry.tx_hash)} target="_blank" rel="noreferrer" className="badge-link">
                      {shortAddress(entry.tx_hash, 8, 6)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          This table is an index, not the record. Each transaction was read back from the network
          before it was listed, and every row links to it on the explorer — where the contract
          event it emitted, and the wallet that signed it, can be checked independently.
        </p>
      )}
    </section>
  );
}
