"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_CRITERIA, MAX_MILESTONES } from "@sprintos/schemas/milestone";
import type { GitHubMilestoneSummary, GitHubRepositorySnapshot } from "@/lib/github";
import { ProductIcon } from "./ProductIcon";
import { FoxSpinner } from "./FoxLoader";

export interface ImportedMilestone {
  title: string;
  criteria: string[];
  deadline: string | null;
}

interface GitHubRepositoryOption {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  updated_at: string;
}

interface GitHubSessionState {
  configured: boolean;
  connected: boolean;
  user?: { login: string; name: string | null; avatar_url: string };
  repositories: GitHubRepositoryOption[];
  error?: string;
}

export function GitHubRepositoryPanel({
  onRepositorySelected,
  onImport,
}: {
  onRepositorySelected: (snapshot: GitHubRepositorySnapshot | null) => void;
  onImport: (milestones: ImportedMilestone[]) => void;
}) {
  const [session, setSession] = useState<GitHubSessionState | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [snapshot, setSnapshot] = useState<GitHubRepositorySnapshot | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Signing in and pasting a public URL are two equally valid ways in. The
     second one used to be hidden inside a collapsed `details`, which made the
     whole step look like it required a GitHub account. */
  const [mode, setMode] = useState<"account" | "public">("account");

  const selectedMilestones = useMemo(
    () => snapshot?.milestones.filter((milestone) => selected.includes(milestone.number)) ?? [],
    [selected, snapshot],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/github/session", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as GitHubSessionState }))
      .then(({ body }) => {
        if (cancelled) return;
        setSession(body);
        /* Where OAuth is not configured, offering sign-in first is a dead end,
           so open on the path that actually works. */
        if (!body.configured && !body.connected) setMode("public");
      })
      .catch(() => { if (!cancelled) setSession({ configured: false, connected: false, repositories: [], error: "GitHub status could not be loaded." }); });
    return () => { cancelled = true; };
  }, []);

  async function scanRepository(value = repositoryUrl) {
    const scanningCurrentRepository = snapshot?.repository.html_url === value;
    setLoading(true);
    setError(null);
    if (!scanningCurrentRepository) {
      setSnapshot(null);
      setSelected([]);
      onRepositorySelected(null);
    }
    try {
      const response = await fetch(`/api/github/repository?repo=${encodeURIComponent(value)}`);
      const body = (await response.json()) as GitHubRepositorySnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Repository scan failed.");
      setSnapshot(body);
      setRepositoryUrl(body.repository.html_url);
      setSelected(body.milestones.slice(0, MAX_MILESTONES).map((milestone) => milestone.number));
      onRepositorySelected(body);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Repository scan failed.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    setError(null);
    try {
      const response = await fetch("/api/github/session", { method: "DELETE" });
      if (!response.ok) throw new Error("GitHub could not be disconnected. Try again.");
      setSession((current) => ({ configured: current?.configured ?? true, connected: false, repositories: [] }));
      setSnapshot(null);
      setSelected([]);
      setRepositoryUrl("");
      onRepositorySelected(null);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "GitHub could not be disconnected.");
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
    <section className="repo-panel wizard-card" aria-labelledby="repo-panel-title">
      <div className="repo-panel-heading">
        <span className="repo-panel-icon"><ProductIcon name="github" size={28} /></span>
        <div><p className="eyebrow">01 · Source</p><h3 id="repo-panel-title">Point this engagement at a repository</h3></div>
        {session?.connected && session.user ? (
          <div className="github-user">
            <img src={session.user.avatar_url} alt="" />
            <span><b>@{session.user.login}</b><button type="button" onClick={disconnect}>Disconnect</button></span>
          </div>
        ) : null}
      </div>

      <p className="repo-why">
        The repository is what the milestones will be judged against. SprintOS reads its name,
        default branch and any existing GitHub milestones and issues, and can turn those straight
        into acceptance criteria. It never writes to your repository and never pushes code.
      </p>

      {!session?.connected && (
        <div className="repo-mode-tabs" role="tablist" aria-label="How to select a repository">
          <button type="button" role="tab" aria-selected={mode === "account"} className={mode === "account" ? "is-active" : ""} onClick={() => setMode("account")}>
            <ProductIcon name="github" size={18} />
            <span><b>Sign in to GitHub</b><small>Pick from your own repositories, public or private</small></span>
          </button>
          <button type="button" role="tab" aria-selected={mode === "public"} className={mode === "public" ? "is-active" : ""} onClick={() => setMode("public")}>
            <ProductIcon name="link" size={18} />
            <span><b>Paste a public URL</b><small>No account needed — works for any public repo</small></span>
          </button>
        </div>
      )}

      {!session ? (
        <div className="repo-auth-wait"><FoxSpinner /> Checking GitHub…</div>
      ) : session.connected ? (
        <div className="repo-picker">
          <label htmlFor="github-repository">Choose a repository</label>
          <div className="repo-connect-row">
            <div className="repo-url-field">
              <ProductIcon name="branch" size={18} />
              <select id="github-repository" value={repositoryUrl} onChange={(event) => {
                const value = event.target.value;
                setRepositoryUrl(value);
                if (value) {
                  if (snapshot?.repository.html_url !== value) {
                    setSnapshot(null);
                    setSelected([]);
                    onRepositorySelected(null);
                  }
                  void scanRepository(value);
                } else {
                  setSnapshot(null);
                  setSelected([]);
                  onRepositorySelected(null);
                }
              }}>
                <option value="">Select from your GitHub repositories…</option>
                {session.repositories.map((repository) => (
                  <option value={repository.html_url} key={repository.id}>{repository.full_name}{repository.private ? " · private" : ""}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => scanRepository()} disabled={loading || !repositoryUrl}>
              {loading ? <><FoxSpinner /> Reading repo…</> : <><ProductIcon name="scan" size={18} /> Use repository</>}
            </button>
          </div>
        </div>
      ) : mode === "account" ? (
        <div className="github-connect-gate">
          <div>
            <strong>Sign in once, then pick a repository.</strong>
            <p>SprintOS asks for read-only access to repository metadata and project planning data. You can disconnect at any time.</p>
          </div>
          {session.configured ? (
            <a href="/api/github/auth?returnTo=/sponsor" className="btn btn-primary"><ProductIcon name="github" size={18} /> Connect GitHub</a>
          ) : (
            <span className="github-config-note">GitHub sign-in is not configured on this deployment — use a public repository URL instead.</span>
          )}
        </div>
      ) : null}

      {!session?.connected && mode === "public" && (
        <div className="repo-public-entry">
          <label htmlFor="public-repo">Public repository URL</label>
          <div className="repo-connect-row">
            <div className="repo-url-field">
              <ProductIcon name="link" size={18} />
              <input id="public-repo" type="url" value={repositoryUrl} onChange={(event) => {
                const value = event.target.value;
                setRepositoryUrl(value);
                if (snapshot && value.trim() !== snapshot.repository.html_url) {
                  setSnapshot(null);
                  setSelected([]);
                  onRepositorySelected(null);
                }
              }} onKeyDown={(event) => { if (event.key === "Enter") void scanRepository(); }} placeholder="https://github.com/owner/repository" />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => scanRepository()} disabled={loading || !repositoryUrl.trim()}>
              {loading ? <><FoxSpinner /> Reading…</> : <><ProductIcon name="scan" size={18} /> Read repository</>}
            </button>
          </div>
        </div>
      )}

      {(error ?? session?.error) && <p className="notice repo-notice">{error ?? session?.error}</p>}

      {snapshot && (
        <div className="repo-results">
          <div className="repo-summary">
            <div className="repo-summary-mark"><ProductIcon name="branch" size={25} /></div>
            <div className="repo-summary-name"><a href={snapshot.repository.html_url} target="_blank" rel="noreferrer">{snapshot.repository.full_name} ↗</a><span>{snapshot.repository.default_branch}</span></div>
            <RepoStat value={String(snapshot.milestones.length)} label="milestones" />
            <RepoStat value={String(snapshot.repository.open_issues_count)} label="open items" />
            <span className="repo-connected"><ProductIcon name="check" size={14} /> Attached to this engagement</span>
          </div>

          {snapshot.milestones.length > 0 ? (
            <>
              <div className="repo-result-title"><span><ProductIcon name="milestone" size={17} /> Existing GitHub milestones</span><small>{selected.length}/{MAX_MILESTONES} selected</small></div>
              <div className="repo-milestone-grid">
                {snapshot.milestones.map((milestone) => <MilestoneChoice key={milestone.number} milestone={milestone} selected={selected.includes(milestone.number)} disabled={!selected.includes(milestone.number) && selected.length >= MAX_MILESTONES} onToggle={() => toggle(milestone.number)} />)}
              </div>
              <div className="repo-import-row"><span className="faint mono">Use GitHub issues as criteria, or write a new brief next.</span><button type="button" className="btn btn-ghost" disabled={selected.length === 0} onClick={importMilestones}>Use {selected.length || ""} milestone{selected.length === 1 ? "" : "s"} →</button></div>
            </>
          ) : <div className="repo-empty"><ProductIcon name="milestone" size={28} /><span>Repository selected. Build a milestone plan in the next step.</span></div>}
        </div>
      )}
    </section>
  );
}

function RepoStat({ value, label }: { value: string; label: string }) {
  return <div className="repo-stat"><strong>{value}</strong><span>{label}</span></div>;
}

function MilestoneChoice({ milestone, selected, disabled, onToggle }: { milestone: GitHubMilestoneSummary; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const total = milestone.open_issues + milestone.closed_issues;
  const progress = total > 0 ? Math.round((milestone.closed_issues / total) * 100) : 0;
  return (
    <button type="button" className={`repo-milestone${selected ? " is-selected" : ""}`} onClick={onToggle} disabled={disabled} aria-pressed={selected}>
      <span className="repo-milestone-check">{selected && <ProductIcon name="check" size={15} />}</span>
      <span className="repo-milestone-copy"><strong>{milestone.title}</strong><small>{milestone.due_on ? milestone.due_on.slice(0, 10) : "No due date"}</small></span>
      <span className="repo-progress" style={{ "--repo-progress": `${progress}%` } as React.CSSProperties}><b>{progress}%</b></span>
      {milestone.issues.length > 0 && <span className="repo-issue-dots" role="img" aria-label={`${milestone.issues.length} criteria detected`}>{milestone.issues.slice(0, MAX_CRITERIA).map((issue) => <i key={issue.number} />)}</span>}
    </button>
  );
}

function toImportedMilestone(milestone: GitHubMilestoneSummary): ImportedMilestone {
  const criteria = milestone.issues.slice(0, MAX_CRITERIA).map((issue) => `Resolve #${issue.number}: ${issue.title} (${issue.html_url})`);
  return { title: milestone.title, criteria: criteria.length > 0 ? criteria : [`Complete GitHub milestone: ${milestone.title}`], deadline: milestone.due_on?.slice(0, 10) ?? null };
}
