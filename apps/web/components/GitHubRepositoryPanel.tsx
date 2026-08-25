"use client";

import { useMemo, useState } from "react";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";
import type { GitHubMilestoneSummary, GitHubRepositorySnapshot } from "@/lib/github";
import { ProductIcon } from "./ProductIcon";
import { FoxSpinner } from "./FoxLoader";

export interface ImportedMilestone {
  title: string;
  criteria: string[];
  deadline: string | null;
}

export function GitHubRepositoryPanel({ onImport }: { onImport: (milestones: ImportedMilestone[]) => void }) {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [snapshot, setSnapshot] = useState<GitHubRepositorySnapshot | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMilestones = useMemo(
    () => snapshot?.milestones.filter((milestone) => selected.includes(milestone.number)) ?? [],
    [selected, snapshot],
  );

  async function scanRepository() {
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setSelected([]);
    try {
      const response = await fetch(`/api/github/repository?repo=${encodeURIComponent(repositoryUrl)}`);
      const body = (await response.json()) as GitHubRepositorySnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Repository scan failed.");
      setSnapshot(body);
      setRepositoryUrl(body.repository.html_url);
      setSelected(body.milestones.slice(0, MAX_MILESTONES).map((milestone) => milestone.number));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Repository scan failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(milestoneNumber: number) {
    setSelected((current) => {
      if (current.includes(milestoneNumber)) return current.filter((number) => number !== milestoneNumber);
      if (current.length >= MAX_MILESTONES) return current;
      return [...current, milestoneNumber];
    });
  }

  function importMilestones() {
    onImport(selectedMilestones.map(toImportedMilestone));
  }

  return (
    <section className="repo-panel" aria-labelledby="repo-panel-title">
      <div className="repo-panel-heading">
        <span className="repo-panel-icon"><ProductIcon name="github" size={28} /></span>
        <div>
          <p className="eyebrow">01 · Repository</p>
          <h3 id="repo-panel-title">Connect GitHub</h3>
        </div>
        {snapshot && <span className="repo-connected"><ProductIcon name="check" size={14} /> Connected</span>}
      </div>

      <div className="repo-connect-row">
        <div className="repo-url-field">
          <ProductIcon name="link" size={18} />
          <input
            aria-label="Public GitHub repository"
            type="url"
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void scanRepository(); }}
            placeholder="https://github.com/owner/repository"
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={scanRepository} disabled={loading || !repositoryUrl.trim()}>
          {loading ? <><FoxSpinner /> Scanning…</> : <><ProductIcon name="scan" size={18} /> Scan repo</>}
        </button>
      </div>

      {error && <p className="notice repo-notice">{error}</p>}

      {snapshot && (
        <div className="repo-results">
          <div className="repo-summary">
            <div className="repo-summary-mark"><ProductIcon name="branch" size={25} /></div>
            <div className="repo-summary-name">
              <a href={snapshot.repository.html_url} target="_blank" rel="noreferrer">{snapshot.repository.full_name} ↗</a>
              <span>{snapshot.repository.default_branch}</span>
            </div>
            <RepoStat value={String(snapshot.milestones.length)} label="milestones" />
            <RepoStat value={String(snapshot.repository.open_issues_count)} label="open items" />
            <RepoStat value={String(snapshot.repository.stargazers_count)} label="stars" />
          </div>

          {snapshot.milestones.length > 0 ? (
            <>
              <div className="repo-result-title">
                <span><ProductIcon name="milestone" size={17} /> Recognized milestones</span>
                <small>{selected.length}/{MAX_MILESTONES} selected</small>
              </div>
              <div className="repo-milestone-grid">
                {snapshot.milestones.map((milestone) => (
                  <MilestoneChoice
                    key={milestone.number}
                    milestone={milestone}
                    selected={selected.includes(milestone.number)}
                    disabled={!selected.includes(milestone.number) && selected.length >= MAX_MILESTONES}
                    onToggle={() => toggle(milestone.number)}
                  />
                ))}
              </div>
              <div className="repo-import-row">
                <span className="faint mono">Issues become checkable acceptance criteria.</span>
                <button type="button" className="btn btn-ghost" disabled={selected.length === 0} onClick={importMilestones}>
                  Import {selected.length || ""} milestone{selected.length === 1 ? "" : "s"} →
                </button>
              </div>
            </>
          ) : (
            <div className="repo-empty">
              <ProductIcon name="milestone" size={28} />
              <span>No open GitHub milestones found. Add one below manually.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RepoStat({ value, label }: { value: string; label: string }) {
  return <div className="repo-stat"><strong>{value}</strong><span>{label}</span></div>;
}

function MilestoneChoice({
  milestone,
  selected,
  disabled,
  onToggle,
}: {
  milestone: GitHubMilestoneSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const total = milestone.open_issues + milestone.closed_issues;
  const progress = total > 0 ? Math.round((milestone.closed_issues / total) * 100) : 0;
  return (
    <button
      type="button"
      className={`repo-milestone${selected ? " is-selected" : ""}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className="repo-milestone-check">{selected && <ProductIcon name="check" size={15} />}</span>
      <span className="repo-milestone-copy">
        <strong>{milestone.title}</strong>
        <small>{milestone.due_on ? milestone.due_on.slice(0, 10) : "No due date"}</small>
      </span>
      <span className="repo-progress" style={{ "--repo-progress": `${progress}%` } as React.CSSProperties}>
        <b>{progress}%</b>
      </span>
      {milestone.issues.length > 0 && (
        <span className="repo-issue-dots" aria-label={`${milestone.issues.length} criteria detected`}>
          {milestone.issues.slice(0, MAX_CRITERIA).map((issue) => <i key={issue.number} />)}
        </span>
      )}
    </button>
  );
}

function toImportedMilestone(milestone: GitHubMilestoneSummary): ImportedMilestone {
  const criteria = milestone.issues.slice(0, MAX_CRITERIA).map(
    (issue) => `Resolve #${issue.number}: ${issue.title} (${issue.html_url})`,
  );
  return {
    title: milestone.title,
    criteria: criteria.length > 0 ? criteria : [`Complete GitHub milestone: ${milestone.title}`],
    deadline: milestone.due_on?.slice(0, 10) ?? null,
  };
}
