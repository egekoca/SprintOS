"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { FoxLoader } from "@/components/FoxLoader";
import { ProductIcon } from "@/components/ProductIcon";
import { listEngagements, type Engagement } from "@/lib/stellar/contract";
import { explorerAccount, formatUsdc, shortAddress } from "@/lib/stellar/config";
import {
  PAGE_SIZE,
  pageOf,
  standings,
  totalsOf,
  type BuilderStanding,
} from "@/lib/leaderboard";

/**
 * What the programme has done, and who did it.
 *
 * Every figure is computed here from engagements read off chain. Nothing is
 * cached, incremented or stored, so there is no number on this page that the
 * application could get wrong on its own — anyone can recompute all of it from
 * the contract. For a project whose argument is that claims should be checkable,
 * a dashboard backed by a database would have been the wrong thing to build.
 */
export default function BoardPage() {
  const { address } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => setEngagements(await listEngagements()), []);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    setLoading(true);
    setError(null);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [load, attempt]);

  const totals = useMemo(() => totalsOf(engagements), [engagements]);
  const all = useMemo(() => standings(engagements), [engagements]);
  const board = useMemo(() => pageOf(all, page, address), [all, page, address]);

  /* The podium is for a field, not for a winner standing alone. Below three
     builders it says less than the table does, so the table gets everyone. */
  const podium = board.page === 1 && all.length >= 3 ? board.rows.slice(0, 3) : [];
  const listed = board.rows.slice(podium.length);

  if (loading) return <FoxLoader label="Reading the ledger" />;

  return (
    <section className="shell stack-l" style={{ paddingBlock: "2.5rem" }}>
      <header className="stack-s">
        <p className="eyebrow">The programme so far</p>
        <h2>Every payment, counted from the ledger<span className="rec-hot">.</span></h2>
        <p className="muted" style={{ maxWidth: "64ch" }}>
          Nothing below is stored by SprintOS. These figures are recomputed from the
          settlement contract each time this page loads, so you can check any of them
          against the chain yourself.
        </p>
      </header>

      {error && (
        <p className="notice">
          {error}{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}

      <div className="stat-row">
        <Stat icon="milestone" value={String(totals.milestonesPaid)} label="Milestones paid"
          note={`of ${totals.milestonesTotal} defined`} />
        <Stat icon="wallet" value={String(totals.buildersPaid)} label="Builders paid"
          note={`across ${totals.engagements} engagements`} />
        <Stat icon="signature" value={formatUsdc(totals.distributed)} label="USDC to builders"
          note="released after a human approval" strong />
        <Stat icon="shield" value={formatUsdc(totals.inEscrow)} label="USDC in escrow"
          note="committed, not yet decided" />
      </div>

      {totals.reclaimed > 0n && (
        <p className="faint" style={{ fontSize: "0.8125rem", marginTop: "-0.5rem" }}>
          A further {formatUsdc(totals.reclaimed)} USDC went back to sponsors after a milestone
          passed its deadline without being approved.
        </p>
      )}

      <div className="board">
        <div className="spread board-head">
          <div>
            <p className="eyebrow">Builders</p>
            <h3>Ranked by what they were paid</h3>
          </div>
          <span className="faint" style={{ fontSize: "0.75rem" }}>
            {all.length} builder{all.length === 1 ? "" : "s"}
          </span>
        </div>

        {all.length === 0 ? (
          <p className="board-empty">
            No milestone has been released yet. The first builder to be paid appears here.
          </p>
        ) : (
          <>
            {/* The top three get a little more room, but not a whole screen of
                it — the useful part of a board is the part you can scan. */}
            {podium.length > 0 && (
              <ol className="board-podium">
                {podium.map((row) => (
                  <li key={row.address} className={`board-podium-slot is-rank-${row.rank}`}>
                    <span className="board-medal">{row.rank}</span>
                    <a href={explorerAccount(row.address)} target="_blank" rel="noreferrer" className="mono">
                      {shortAddress(row.address, 4, 4)}
                    </a>
                    <b>{formatUsdc(row.earned)}</b>
                    <small>{row.milestonesPaid} milestone{row.milestonesPaid === 1 ? "" : "s"}</small>
                  </li>
                ))}
              </ol>
            )}

            {(listed.length > 0 || board.pinned) && (
            <table className="board-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Builder</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Milestones</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((row) => (
                  <Row key={row.address} row={row} mine={row.address === address} />
                ))}
                {board.pinned && (
                  <>
                    <tr className="board-gap"><td colSpan={5}>· · ·</td></tr>
                    <Row row={board.pinned} mine />
                  </>
                )}
              </tbody>
            </table>
            )}

            {board.pageCount > 1 && (
              <div className="board-pager">
                <button type="button" className="btn btn-ghost btn-sm"
                  disabled={board.page === 1} onClick={() => setPage(board.page - 1)}>
                  ← Previous
                </button>
                <span className="faint">
                  Page {board.page} of {board.pageCount}
                  <small> · {PAGE_SIZE} per page</small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm"
                  disabled={board.page === board.pageCount} onClick={() => setPage(board.page + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <p className="faint" style={{ fontSize: "0.8125rem" }}>
        Ranked by USDC actually released, not by what was committed. A builder holding
        three funded milestones nobody has approved yet has earned nothing —{" "}
        <Link href="/docs" className="badge-link">how settlement works →</Link>
      </p>
    </section>
  );
}

function Row({ row, mine }: { row: BuilderStanding; mine: boolean }) {
  return (
    <tr className={mine ? "is-mine" : undefined}>
      <td className="board-rank">{row.rank}</td>
      <td>
        <a href={explorerAccount(row.address)} target="_blank" rel="noreferrer" className="mono">
          {shortAddress(row.address, 6, 6)}
        </a>
        {mine && <span className="board-you">you</span>}
      </td>
      <td className="data">{formatUsdc(row.earned)}</td>
      <td className="data">{row.milestonesPaid}</td>
      <td className="data faint">{row.outstanding || "—"}</td>
    </tr>
  );
}

function Stat({
  icon, value, label, note, strong = false,
}: {
  icon: "milestone" | "wallet" | "signature" | "shield";
  value: string;
  label: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className={`stat${strong ? " is-strong" : ""}`}>
      <span className="stat-icon"><ProductIcon name={icon} size={19} /></span>
      <span className="stat-text">
        <b>{value}</b>
        <span>{label}</span>
        <small>{note}</small>
      </span>
    </div>
  );
}
