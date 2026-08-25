"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import {
  claimApprovedMilestone,
  listEngagements,
  submitEvidence,
  type Engagement,
} from "@/lib/stellar/contract";
import { BUILDER_CLAIM_ENABLED, formatUsdc } from "@/lib/stellar/config";
import { StatusPill } from "@/components/StatusPill";
import { TxLink } from "@/components/TxLink";
import { FoxLoader, FoxSpinner } from "@/components/FoxLoader";
import { MAX_EVIDENCE, type EvidenceType } from "@sprintos/schemas/milestone";

/**
 * The builder's desk: the milestones assigned to the connected wallet, and a
 * form for attaching public proof of work.
 *
 * Up to five links, each typed so the advisory module knows how to read it.
 * The bundle is hashed and anchored on chain along with a public pointer.
 */

const TYPES: { value: EvidenceType; label: string }[] = [
  { value: "repo", label: "Repository" },
  { value: "commit", label: "Commit" },
  { value: "pull_request", label: "Pull request" },
  { value: "test_result", label: "Test result" },
  { value: "docs", label: "Documentation" },
  { value: "demo", label: "Demo" },
];

interface LinkRow { url: string; type: EvidenceType }

export default function BuilderPage() {
  const { address, connect } = useWallet();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; idx: number } | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([{ url: "", type: "repo" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; action: "submit" | "claim" } | null>(null);

  useEffect(() => {
    listEngagements()
      .then(setEngagements)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const mine = engagements.filter((e) => e.builder === address);

  async function handleSubmit() {
    if (!address || !selected) return;
    setError(null);
    setBusy(true);
    try {
      const cleaned = links.filter((l) => l.url.trim());
      if (cleaned.length === 0) throw new Error("Add at least one public link.");

      const bundle = {
        schema_version: "1.0.0" as const,
        engagement_id: selected.id,
        milestone_idx: selected.idx,
        submitted_at: new Date().toISOString(),
        ...(note.trim() ? { note: note.trim() } : {}),
        links: cleaned.map((l) => ({ url: l.url.trim(), type: l.type })),
      };

      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const body = (await res.json()) as { hash?: string; error?: string };
      if (!res.ok || !body.hash) throw new Error(body.error ?? "The evidence bundle was rejected.");

      const bundleUri = new URL(`/api/evidence?hash=${encodeURIComponent(body.hash)}`, window.location.origin).toString();
      const tx = await submitEvidence(address, BigInt(selected.id), selected.idx, body.hash, bundleUri);
      setDone({ hash: tx.hash, action: "submit" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClaim(id: bigint, idx: number) {
    if (!address) return;
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const tx = await claimApprovedMilestone(address, id, idx);
      setDone({ hash: tx.hash, action: "claim" });
      setEngagements(await listEngagements());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <section className="shell" style={{ paddingBlock: "4rem" }}>
        <div className="panel stack" style={{ maxWidth: "42rem" }}>
          <h2>Builder</h2>
          <p className="muted">Connect the wallet a sponsor assigned as builder to see your milestones.</p>
          <div><button type="button" className="btn btn-primary" onClick={connect}>Connect wallet</button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="shell stack-l" style={{ paddingBlock: "3rem" }}>
      <div className="stack-s">
        <p className="eyebrow">Builder</p>
        <h2>Show your work<span style={{ color: "var(--orange)" }}>.</span></h2>
        <p className="lede">
          Up to {MAX_EVIDENCE} public links per milestone. Everything you submit must be readable
          without a login — the review module never opens a private source.
        </p>
      </div>

      {error && <p className="notice">{error}</p>}
      {done?.action === "claim" && (
        <div className="stack-s">
          <p className="notice notice-ok">Approved payment claimed.</p>
          <TxLink hash={done.hash} />
        </div>
      )}
      {loading && <FoxLoader label="Reading the ledger" />}

      {!loading && mine.length === 0 && (
        <div className="panel">
          <p className="muted">
            No engagements name this wallet as builder yet. Ask your sponsor to create one with
            your address, or check that you connected the right wallet.
          </p>
        </div>
      )}

      {mine.map((e) => (
        <div key={String(e.id)} className="panel stack">
          <div className="spread">
            <h3>Engagement #{String(e.id)}</h3>
            <Link href={`/e/${e.id}`} className="badge-link">Public page →</Link>
          </div>
          <div className="stack-s">
            {e.milestones.map((m, idx) => {
              const open = m.status === "Pending" || m.status === "Held";
              const isSelected = selected?.id === String(e.id) && selected.idx === idx;
              return (
                <div key={idx} style={{ borderTop: "1px solid var(--edge)", paddingTop: "0.75rem" }}>
                  <div className="spread">
                    <div className="stack-s" style={{ gap: "0.25rem" }}>
                      <strong>{m.title}</strong>
                      <span className="faint mono" style={{ fontSize: "0.75rem" }}>
                        {formatUsdc(m.amount)} USDC · due {new Date(Number(m.deadline) * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="row">
                      <StatusPill status={m.status} />
                      {open && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setSelected(isSelected ? null : { id: String(e.id), idx }); setDone(null); }}
                        >
                          {isSelected ? "Cancel" : m.status === "Held" ? "Resubmit" : "Submit evidence"}
                        </button>
                      )}
                      {m.status === "Approved" && BUILDER_CLAIM_ENABLED && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          onClick={() => handleClaim(e.id, idx)}
                        >
                          {busy ? <><FoxSpinner /> Waiting for signature…</> : "Claim approved payment"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="stack" style={{ marginTop: "1rem", padding: "1rem", background: "var(--concrete-2)", borderRadius: "var(--radius)" }}>
                      {m.status === "Held" && (
                        <p className="notice" style={{ borderLeftColor: "var(--st-held)" }}>
                          The reviewer put this milestone on hold. Address what they flagged and submit again.
                        </p>
                      )}
                      <div className="stack-s">
                        <label>Public links</label>
                        {links.map((l, li) => (
                          <div key={li} className="row" style={{ gap: "0.5rem", flexWrap: "nowrap" }}>
                            <input
                              type="url"
                              placeholder="https://github.com/…"
                              value={l.url}
                              onChange={(ev) => setLinks((p) => p.map((x, i) => (i === li ? { ...x, url: ev.target.value } : x)))}
                            />
                            <select
                              value={l.type}
                              style={{ width: "auto", minWidth: "9rem" }}
                              onChange={(ev) => setLinks((p) => p.map((x, i) => (i === li ? { ...x, type: ev.target.value as EvidenceType } : x)))}
                            >
                              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                        ))}
                        {links.length < MAX_EVIDENCE && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinks((p) => [...p, { url: "", type: "repo" }])}>
                            Add link
                          </button>
                        )}
                      </div>

                      <div className="field">
                        <label htmlFor="note">Note for the reviewer (optional)</label>
                        <textarea id="note" rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What changed since last time, or where to start reading." />
                      </div>

                      <div className="row">
                        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
                          {busy ? <><FoxSpinner /> Waiting for signature…</> : "Sign: submit evidence"}
                        </button>
                      </div>

                      {done && (
                        <div className="stack-s">
                          <p className="notice notice-ok">
                            {done.action === "claim" ? "Approved payment claimed." : "Evidence recorded on chain."}
                          </p>
                          <TxLink hash={done.hash} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
