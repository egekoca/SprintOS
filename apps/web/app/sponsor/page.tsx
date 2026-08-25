"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { createEngagement, fundEngagement, type MilestoneDraft } from "@/lib/stellar/contract";
import { formatUsdc, parseUsdc } from "@/lib/stellar/config";
import { TxLink } from "@/components/TxLink";
import { FoxSpinner } from "@/components/FoxLoader";
import { GitHubRepositoryPanel, type ImportedMilestone } from "@/components/GitHubRepositoryPanel";
import { ProductIcon } from "@/components/ProductIcon";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";

/**
 * The sponsor's desk: define milestones, then fund them.
 *
 * Criteria are typed here and hashed before anything reaches the ledger, so
 * what the builder is held to is fixed at funding time and cannot be quietly
 * rewritten afterwards.
 */

interface MilestoneForm {
  title: string;
  criteria: string[];
  amount: string;
  deadline: string;
}

function emptyMilestone(offsetDays: number): MilestoneForm {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return {
    title: "",
    criteria: [""],
    amount: "",
    deadline: d.toISOString().slice(0, 10),
  };
}

export default function SponsorPage() {
  const { address, connect } = useWallet();
  const [builder, setBuilder] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [milestones, setMilestones] = useState<MilestoneForm[]>([emptyMilestone(7)]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ hash: string } | null>(null);
  const [funded, setFunded] = useState<{ hash: string } | null>(null);
  const [engagementId, setEngagementId] = useState<string>("");

  const total = milestones.reduce((sum, m) => {
    try {
      return sum + parseUsdc(m.amount || "0");
    } catch {
      return sum;
    }
  }, 0n);

  function update(idx: number, patch: Partial<MilestoneForm>) {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function importMilestones(imported: ImportedMilestone[]) {
    setError(null);
    setCreated(null);
    setFunded(null);
    setMilestones(imported.slice(0, MAX_MILESTONES).map((milestone, index) => ({
      title: milestone.title,
      criteria: milestone.criteria.slice(0, MAX_CRITERIA),
      amount: "",
      deadline: milestone.deadline ?? emptyMilestone(7 * (index + 1)).deadline,
    })));
  }

  async function handleCreate() {
    if (!address) return;
    setError(null);
    setBusy("create");
    try {
      // Criteria exist before the numeric on-chain id does. Give this draft a
      // collision-resistant reference and store each document by its content
      // hash; the reviewer later retrieves it using the hash anchored on chain.
      const draftReference = `draft:${crypto.randomUUID()}`;
      const drafts: MilestoneDraft[] = await Promise.all(
        milestones.map(async (m, idx) => {
          const criteria = m.criteria.map((text, i) => ({ id: `c${i + 1}`, text: text.trim() })).filter((c) => c.text);
          if (criteria.length === 0) throw new Error(`Milestone ${idx + 1} needs at least one acceptance criterion.`);

          const doc = {
            schema_version: "1.0.0" as const,
            engagement_id: draftReference,
            milestone_idx: idx,
            title: m.title.trim(),
            criteria,
          };
          const res = await fetch("/api/criteria", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(doc),
          });
          const body = (await res.json()) as { hash?: string; error?: string };
          if (!res.ok || !body.hash) {
            throw new Error(body.error ?? "The acceptance criteria were rejected.");
          }

          return {
            title: m.title.trim(),
            criteriaHash: body.hash,
            amount: parseUsdc(m.amount),
            deadline: Math.floor(new Date(`${m.deadline}T23:59:59Z`).getTime() / 1000),
          };
        }),
      );

      const tx = await createEngagement(address, builder.trim(), reviewer.trim(), drafts);
      setCreated(tx);
      setEngagementId(String(tx.engagementId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleFund() {
    if (!address || !engagementId) return;
    setError(null);
    setBusy("fund");
    try {
      setFunded(await fundEngagement(address, BigInt(engagementId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="shell sponsor-page" style={{ paddingBlock: "3rem" }}>
      <div className="sponsor-title-row">
        <div className="stack-s">
          <p className="eyebrow">Sponsor workspace</p>
          <h2>Build the engagement<span style={{ color: "var(--orange)" }}>.</span></h2>
        </div>
        <div className="sponsor-wallet-state">
          <ProductIcon name="wallet" size={21} />
          {address ? <span className="mono">Wallet ready</span> : <button type="button" onClick={connect}>Connect wallet</button>}
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="sponsor-flow" aria-label="Engagement setup steps">
        <FlowStep number="1" icon="github" label="Repository" active />
        <FlowStep number="2" icon="milestone" label="Milestones" active={milestones.some((milestone) => milestone.title)} />
        <FlowStep number="3" icon="wallet" label="Roles" active={Boolean(builder && reviewer)} />
        <FlowStep number="4" icon="signature" label="Sign & fund" active={Boolean(created)} />
      </div>

      <GitHubRepositoryPanel onImport={importMilestones} />

      <div className="panel stack sponsor-section">
        <div className="sponsor-section-title">
          <span><ProductIcon name="wallet" size={22} /></span>
          <div><p className="eyebrow">03 · Parties</p><h3>Assign roles</h3></div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="builder">Builder address</label>
            <input id="builder" type="text" placeholder="G…" value={builder} onChange={(e) => setBuilder(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reviewer">Reviewer address</label>
            <input id="reviewer" type="text" placeholder="G…" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="sponsor-milestones-heading">
        <div className="sponsor-section-title">
          <span><ProductIcon name="milestone" size={22} /></span>
          <div><p className="eyebrow">02 · Scope</p><h3>Milestones</h3></div>
        </div>
        <span className="mono faint">{milestones.length}/{MAX_MILESTONES}</span>
      </div>

      <div className="sponsor-milestone-list">
      {milestones.map((m, idx) => (
        <div key={idx} className="panel stack sponsor-milestone-card">
          <div className="spread">
            <div className="row"><span className="sponsor-milestone-number">0{idx + 1}</span><h3>{m.title || `Milestone ${idx + 1}`}</h3></div>
            {milestones.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMilestones((p) => p.filter((_, i) => i !== idx))}>
                Remove
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor={`title-${idx}`}>Title</label>
            <input id={`title-${idx}`} type="text" value={m.title} onChange={(e) => update(idx, { title: e.target.value })} placeholder="Soroban settlement contract" />
          </div>

          <div className="field">
            <label>Acceptance criteria</label>
            <div className="stack-s">
              {m.criteria.map((c, ci) => (
                <input
                  key={ci}
                  type="text"
                  value={c}
                  placeholder={`Criterion ${ci + 1} — something a reviewer can check`}
                  onChange={(e) => update(idx, { criteria: m.criteria.map((x, i) => (i === ci ? e.target.value : x)) })}
                />
              ))}
              {m.criteria.length < MAX_CRITERIA && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(idx, { criteria: [...m.criteria, ""] })}>
                  Add criterion
                </button>
              )}
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor={`amount-${idx}`}>Amount (USDC)</label>
              <input id={`amount-${idx}`} type="text" inputMode="decimal" value={m.amount} onChange={(e) => update(idx, { amount: e.target.value })} placeholder="500" />
            </div>
            <div className="field">
              <label htmlFor={`deadline-${idx}`}>Deadline</label>
              <input id={`deadline-${idx}`} type="date" value={m.deadline} onChange={(e) => update(idx, { deadline: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      </div>

      <div className="spread sponsor-total-row">
        {milestones.length < MAX_MILESTONES ? (
          <button type="button" className="btn btn-ghost" onClick={() => setMilestones((p) => [...p, emptyMilestone(7 * (p.length + 1))])}>
            Add milestone
          </button>
        ) : (
          <span className="faint" style={{ fontSize: "0.8125rem" }}>Three milestones is the maximum.</span>
        )}
        <span className="amount" style={{ fontSize: "1.5rem" }}>
          {formatUsdc(total)} <span className="faint mono" style={{ fontSize: "0.75rem" }}>USDC total</span>
        </span>
      </div>

      <div className="panel panel-marked stack sponsor-sign-panel">
        <div className="sponsor-section-title">
          <span><ProductIcon name="signature" size={22} /></span>
          <div><p className="eyebrow">04 · Authorization</p><h3>Create & fund</h3></div>
        </div>
        <div className="row">
          {address ? (
            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy !== null || !builder || !reviewer}>
              {busy === "create" ? <><FoxSpinner /> Waiting for signature…</> : <><ProductIcon name="signature" size={18} /> Sign engagement</>}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={connect}><ProductIcon name="wallet" size={18} /> Connect wallet</button>
          )}
        </div>
        {created && (
          <div className="stack-s">
            <p className="notice notice-ok">Engagement created.</p>
            <TxLink hash={created.hash} />
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <div className="field" style={{ maxWidth: "10rem" }}>
                <label htmlFor="eid">Engagement id</label>
                <input id="eid" type="text" value={engagementId} onChange={(e) => setEngagementId(e.target.value)} placeholder="0" />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleFund} disabled={busy !== null || !engagementId} style={{ alignSelf: "flex-end" }}>
                {busy === "fund" ? <><FoxSpinner /> Waiting for signature…</> : `Sign: fund ${formatUsdc(total)} USDC`}
              </button>
            </div>
            <p className="faint" style={{ fontSize: "0.8125rem" }}>
              The id is in the transaction result — or find it on{" "}
              <Link href="/review">the review list</Link>.
            </p>
          </div>
        )}
        {funded && (
          <div className="stack-s">
            <p className="notice notice-ok">Escrow funded.</p>
            <TxLink hash={funded.hash} />
            <Link href={`/e/${engagementId}`} className="badge-link">Open the engagement page →</Link>
          </div>
        )}
      </div>
    </section>
  );
}

function FlowStep({ number, icon, label, active }: { number: string; icon: "github" | "milestone" | "wallet" | "signature"; label: string; active: boolean }) {
  return (
    <div className={`sponsor-flow-step${active ? " is-active" : ""}`}>
      <span className="sponsor-flow-icon"><ProductIcon name={icon} size={19} /></span>
      <span><small>{number.padStart(2, "0")}</small>{label}</span>
    </div>
  );
}
