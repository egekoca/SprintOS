export interface GitHubIssueSummary {
  number: number;
  title: string;
  html_url: string;
}

export interface GitHubMilestoneSummary {
  number: number;
  title: string;
  description: string | null;
  html_url: string;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  issues: GitHubIssueSummary[];
}

export interface GitHubRepositorySnapshot {
  repository: {
    owner: string;
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    default_branch: string;
    open_issues_count: number;
    stargazers_count: number;
  };
  milestones: GitHubMilestoneSummary[];
}

export function parseGitHubRepository(input: string): { owner: string; repo: string } {
  const value = input.trim();
  let path = value;

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Use an https://github.com repository URL.");
    }
    path = url.pathname;
  }

  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) throw new Error("Use a repository URL such as github.com/owner/repo.");

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  const valid = /^[A-Za-z0-9_.-]+$/;
  if (!valid.test(owner) || !valid.test(repo) || !owner || !repo) {
    throw new Error("The GitHub owner or repository name is invalid.");
  }
  return { owner, repo };
}
