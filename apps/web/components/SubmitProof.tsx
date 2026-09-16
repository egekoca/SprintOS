"use client";

import { useState } from "react";
import { submitEvidence } from "@/lib/stellar/contract";
import { PUBLIC_APP_URL } from "@/lib/stellar/config";
import { FoxSpinner } from "./FoxLoader";
import { TxLink } from "./TxLink";

/**
 * The builder's one-click repository attestation, opened on the milestone it belongs to.
 *
 * It used to be a separate page with its own engagement picker and its own
 * milestone picker — two choices the builder had already made by clicking the
 * row. Here the milestone is simply the one they are looking at.
 *
 * SprintOS chooses the repository files automatically. The builder does not
 * choose links or write a note; their signature attests to the snapshot that
 * SprintOS just inspected.
 */

export function SubmitProof({
  engagementId,
  milestoneIdx,
  criteriaHash,
  builder,
  onDone,
  onCancel,
}: {
  engagementId: bigint;
  milestoneIdx: number;
  criteriaHash: string;
  builder: string;
  onDone?: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const projectResponse = await fetch(`/api/project?engagement_id=${engagementId}`);
      const projectBody = (await projectResponse.json()) as { project?: { repository?: string }; error?: string };
      if (!projectResponse.ok || !projectBody.project?.repository) {
        throw new Error(projectBody.error ?? "This project has no repository attached.");
      }

      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engagement_id: String(engagementId),
          milestone_idx: milestoneIdx,
          criteria_hash: criteriaHash,
          repository: projectBody.project.repository,
        }),
      });
      const body = (await response.json()) as {
        evidence_hash?: string;
        evidence_uri?: string;
        error?: string;
      };
      if (!response.ok || !body.evidence_hash || !body.evidence_uri) {
        throw new Error(body.error ?? "The repository could not be inspected.");
      }

      /* Anchored on chain for good, so it must be the deployment's public
         address rather than whatever host this tab happens to be on. */
      const base = PUBLIC_APP_URL || window.location.origin;
      const uri = body.evidence_uri.startsWith("http")
        ? body.evidence_uri
        : new URL(body.evidence_uri, base).toString();
      const tx = await submitEvidence(builder, engagementId, milestoneIdx, body.evidence_hash, uri);
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
      <span className="group-label">Repository delivery</span>
      <p className="muted" style={{ margin: 0 }}>
        SprintOS will read the repository already attached to this project and collect the
        relevant files automatically. No links or notes are required.
      </p>

      {error && <p className="notice">{error}</p>}

      <div className="submit-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
          {busy ? <><FoxSpinner /> Reading repository…</> : "Scan repository and sign"}
        </button>
      </div>
    </div>
  );
}
