"use client";

import { useState } from "react";
import type { EvidenceType } from "@sprintos/schemas/milestone";
import { MAX_EVIDENCE } from "@sprintos/schemas/milestone";
import { submitEvidence } from "@/lib/stellar/contract";
import { PUBLIC_APP_URL } from "@/lib/stellar/config";
import { FoxSpinner } from "./FoxLoader";
import { TxLink } from "./TxLink";

/**
 * The builder's evidence form, opened on the milestone it belongs to.
 *
 * It used to be a separate page with its own engagement picker and its own
 * milestone picker — two choices the builder had already made by clicking the
 * row. Here the milestone is simply the one they are looking at.
 *
 * The bundle is stored off chain and its hash is what gets signed, so the
 * ledger records exactly which set of links was submitted and nobody can swap
 * them afterwards.
 */

const TYPES: Array<{ value: EvidenceType; label: string }> = [
  { value: "repo", label: "Repository" },
  { value: "commit", label: "Commit" },
  { value: "pull_request", label: "Pull request" },
  { value: "test_result", label: "Test result" },
  { value: "docs", label: "Documentation" },
  { value: "demo", label: "Demo" },
];

type Row = { url: string; type: EvidenceType };

export function SubmitProof({
  engagementId,
  milestoneIdx,
  builder,
  onDone,
  onCancel,
}: {
  engagementId: bigint;
  milestoneIdx: number;
  builder: string;
  onDone?: () => void;
  onCancel: () => void;
}) {
  const [links, setLinks] = useState<Row[]>([{ url: "", type: "repo" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const cleaned = links.filter((link) => link.url.trim());
      if (cleaned.length === 0) throw new Error("Add at least one public link.");

      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "1.0.0" as const,
          engagement_id: String(engagementId),
          milestone_idx: milestoneIdx,
          submitted_at: new Date().toISOString(),
          ...(note.trim() ? { note: note.trim() } : {}),
          links: cleaned.map((link) => ({ url: link.url.trim(), type: link.type })),
        }),
      });
      const body = (await response.json()) as { hash?: string; error?: string };
      if (!response.ok || !body.hash) throw new Error(body.error ?? "The evidence bundle was rejected.");

      /* Anchored on chain for good, so it must be the deployment's public
         address rather than whatever host this tab happens to be on. */
      const base = PUBLIC_APP_URL || window.location.origin;
      const uri = new URL(`/api/evidence?hash=${encodeURIComponent(body.hash)}`, base).toString();
      const tx = await submitEvidence(builder, engagementId, milestoneIdx, body.hash, uri);
      setDone(tx.hash);
      onDone?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="submit-proof">
        <p className="notice notice-ok">Proof submitted.</p>
        <TxLink hash={done} />
      </div>
    );
  }

  return (
    <div className="submit-proof">
      <span className="group-label" id={`proof-${milestoneIdx}`}>
        Public links — proof anyone can open without a login
      </span>

      <div role="group" aria-labelledby={`proof-${milestoneIdx}`} className="submit-rows">
        {links.map((link, index) => (
          <div className="submit-row" key={index}>
            <input
              type="url"
              placeholder="https://github.com/…"
              value={link.url}
              aria-label={`Link ${index + 1}`}
              onChange={(event) =>
                setLinks((rows) => rows.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)))
              }
            />
            <select
              value={link.type}
              aria-label={`Link ${index + 1} type`}
              onChange={(event) =>
                setLinks((rows) =>
                  rows.map((row, i) =>
                    i === index ? { ...row, type: event.target.value as EvidenceType } : row,
                  ),
                )
              }
            >
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {links.length > 1 && (
              <button
                type="button"
                className="decider-remove"
                onClick={() => setLinks((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {links.length < MAX_EVIDENCE && (
          <button
            type="button"
            className="decider-add"
            onClick={() => setLinks((rows) => [...rows, { url: "", type: "repo" }])}
          >
            + Add a link
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor={`note-${milestoneIdx}`}>Note for whoever reviews it (optional)</label>
        <textarea
          id={`note-${milestoneIdx}`}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="submit-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
          {busy ? <><FoxSpinner /> Waiting for signature…</> : "Sign and submit"}
        </button>
      </div>
    </div>
  );
}
