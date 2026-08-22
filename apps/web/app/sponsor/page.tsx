"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { createEngagement, fundEngagement, type MilestoneDraft } from "@/lib/stellar/contract";
import { formatUsdc, parseUsdc } from "@/lib/stellar/config";
import { TxLink } from "@/components/TxLink";
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

  if (!address) {
    return (
      <section className="shell" style={{ paddingBlock: "4rem" }}>
        <div className="panel stack" style={{ maxWidth: "42rem" }}>
          <h2>Sponsor</h2>
          <p className="muted">
            Connect the wallet that will fund the escrow. It becomes the sponsor of record and the
            only address that can reclaim an undelivered milestone after its deadline.
          </p>
          <div><button type="button" className="btn btn-primary" onClick={connect}>Connect wallet</button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="shell stack-l" style={{ paddingBlock: "3rem" }}>
      <div className="stack-s">
        <p className="eyebrow">Sponsor</p>
        <h2>Define and fund<span style={{ color: "var(--orange)" }}>.</span></h2>
        <p className="lede">
          Up to {MAX_MILESTONES} milestones, each with up to {MAX_CRITERIA} acceptance criteria.
          Funding moves the whole total into escrow in one transaction.
        </p>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="panel stack">
        <h3>Roles</h3>
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
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          All three roles must be different addresses. A sponsor who is also the reviewer could
          approve and pay themselves, so the contract refuses it.
        </p>
      </div>

      {milestones.map((m, idx) => (
        <div key={idx} className="panel stack">
          <div className="spread">
            <h3>Milestone {idx + 1}</h3>
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

      <div className="spread">
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

      <div className="panel panel-marked stack">
        <h3>Create, then fund</h3>
        <p className="muted" style={{ fontSize: "0.9375rem" }}>
          Two signatures. Creating records the milestones and their criteria hashes; funding moves
          the USDC. Nothing is escrowed until you sign the second one.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy !== null || !builder || !reviewer}>
            {busy === "create" ? "Waiting for signature…" : "Sign: create engagement"}
          </button>
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
                {busy === "fund" ? "Waiting for signature…" : `Sign: fund ${formatUsdc(total)} USDC`}
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
