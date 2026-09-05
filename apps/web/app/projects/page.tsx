"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { FoxLoader } from "@/components/FoxLoader";
import { ProductIcon } from "@/components/ProductIcon";
import { WalletGate } from "@/components/WalletGate";
import { listEngagements, roleOf, type Engagement, type Role } from "@/lib/stellar/contract";
import { formatUsdc } from "@/lib/stellar/config";

/**
 * Everything this wallet is part of, in one list.
 *
 * This replaces four pages — Overview, Awards, Builder and Review — that were
 * the same projects seen through a different role. The roles are recorded on
 * chain, so the app can say which one you are here rather than making you pick
 * a tab and find out you picked the wrong one.
 */

const ROLE_LABEL: Record<Exclude<Role, "observer">, string> = {
  sponsor: "You fund it",
  builder: "You build it",
  reviewer: "You review it",
};

/** What is actually waiting on this person, so the list can say so. */
function waitingOn(engagement: Engagement, role: Role): string | null {
  const submitted = engagement.milestones.filter((m) => m.status === "EvidenceSubmitted").length;
  const approved = engagement.milestones.filter((m) => m.status === "Approved").length;
  const open = engagement.milestones.filter((m) => m.status === "Pending" || m.status === "Held").length;

  if (role === "builder" && open > 0) return `${open} to submit`;
  if ((role === "sponsor" || role === "reviewer") && submitted > 0) return `${submitted} to review`;
  if ((role === "sponsor" || role === "reviewer") && approved > 0) return `${approved} to pay`;
  return null;
}

export default function ProjectsPage() {
  const { address } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => setEngagements(await listEngagements()), []);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a
     manual retry counter. It is not read in here — bumping it is the whole
     point, because it is how the Retry button re-runs a load that failed. */
  useEffect(() => {
    if (!address) {
      setEngagements([]);
      return;
    }
    setLoading(true);
    setError(null);
    load()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setLoading(false));
  }, [address, load, attempt]);

  const mine = useMemo(
    () =>
      engagements
        .map((engagement) => ({ engagement, role: roleOf(engagement, address) }))
        .filter((row): row is { engagement: Engagement; role: Exclude<Role, "observer"> } =>
          row.role !== "observer",
        ),
    [engagements, address],
  );

  return (
    <section className="shell stack-l" style={{ paddingBlock: "2.5rem" }}>
      <div className="spread projects-head">
        <div className="stack-s">
          <p className="eyebrow">Projects</p>
          <h2>My projects<span className="rec-hot">.</span></h2>
        </div>
        <Link href="/projects/new" className="btn btn-primary">
          <ProductIcon name="milestone" size={18} /> New project
        </Link>
      </div>

      {/* WalletGate is the connect screen itself, not a wrapper — so it stands
          in for the list rather than around it. */}
      {!address ? (
        <WalletGate eyebrow="Projects" title="Connect a wallet to see your projects">
          Your projects are read from the ledger by address, so there is nothing to show until a
          wallet is connected.
        </WalletGate>
      ) : (
      <>
        {loading && <FoxLoader label="Reading the ledger" />}

        {error && (
          <p className="notice">
            {error}{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </p>
        )}

        {!loading && !error && mine.length === 0 && (
          <div className="projects-empty">
            <p>Nothing here yet.</p>
            <p className="faint">
              Create a project, point it at a repository and set its milestones. Or ask whoever is
              funding the work to name your address.
            </p>
          </div>
        )}

        {mine.length > 0 && (
          <ol className="project-list">
            {mine.map(({ engagement, role }) => {
              const paid = engagement.milestones.filter((m) => m.status === "Released").length;
              const waiting = waitingOn(engagement, role);
              return (
                <li key={String(engagement.id)}>
                  <Link href={`/e/${engagement.id}`} className="project-card">
                    <span className="project-id">#{String(engagement.id)}</span>
                    <span className="project-main">
                      <strong>
                        {engagement.milestones.length} milestone
                        {engagement.milestones.length === 1 ? "" : "s"} · {formatUsdc(engagement.total_amount)} USDC
                      </strong>
                      <small>
                        {paid} paid
                        {waiting ? ` · ${waiting}` : ""}
                      </small>
                    </span>
                    <span className={`project-role is-${role}`}>{ROLE_LABEL[role]}</span>
                    <span className="project-go" aria-hidden="true">→</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </>
      )}
    </section>
  );
}
