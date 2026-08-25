import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGitHubRepository, type GitHubRepositorySnapshot } from "@/lib/github";
import { takeRateLimit } from "@/lib/rate-limit";
import { requestClientKey } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Repository = z.object({
  name: z.string(),
  full_name: z.string(),
  html_url: z.string().url(),
  description: z.string().nullable(),
  default_branch: z.string(),
  open_issues_count: z.number().int().nonnegative(),
  stargazers_count: z.number().int().nonnegative(),
  owner: z.object({ login: z.string() }),
});

const Milestone = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  html_url: z.string().url(),
  due_on: z.string().nullable(),
  open_issues: z.number().int().nonnegative(),
  closed_issues: z.number().int().nonnegative(),
});

const Issue = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.string().url(),
  milestone: z.object({ number: z.number().int().positive() }).nullable(),
  pull_request: z.unknown().optional(),
});

function githubHeaders(): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "SprintOS",
    "x-github-api-version": "2026-03-10",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubGet(path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository not found or not public.");
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub scan limit reached. Try again later or configure GITHUB_TOKEN.");
    }
    throw new Error(`GitHub returned ${response.status}.`);
  }
  return response.json();
}

export async function GET(request: Request) {
  const rate = takeRateLimit(`github:${requestClientKey(request)}`, 10, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many repository scans. Try again shortly." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepository(new URL(request.url).searchParams.get("repo") ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid repository." }, { status: 400 });
  }

  const segment = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const [rawRepository, rawMilestones, rawIssues] = await Promise.all([
      githubGet(segment),
      githubGet(`${segment}/milestones?state=open&sort=due_on&direction=asc&per_page=10`),
      githubGet(`${segment}/issues?state=open&milestone=*&sort=updated&direction=desc&per_page=100`),
    ]);

    const repository = Repository.parse(rawRepository);
    const milestones = z.array(Milestone).parse(rawMilestones);
    const issues = z.array(Issue).parse(rawIssues).filter((issue) => !issue.pull_request && issue.milestone);
    const snapshot: GitHubRepositorySnapshot = {
      repository: {
        owner: repository.owner.login,
        name: repository.name,
        full_name: repository.full_name,
        html_url: repository.html_url,
        description: repository.description,
        default_branch: repository.default_branch,
        open_issues_count: repository.open_issues_count,
        stargazers_count: repository.stargazers_count,
      },
      milestones: milestones.map((milestone) => ({
        ...milestone,
        issues: issues
          .filter((issue) => issue.milestone?.number === milestone.number)
          .slice(0, 5)
          .map(({ number, title, html_url }) => ({ number, title, html_url })),
      })),
    };

    return NextResponse.json(snapshot, {
      headers: { "cache-control": "private, max-age=60", "x-ratelimit-remaining": String(rate.remaining) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repository could not be scanned.";
    const status = /not found|not public/i.test(message) ? 404 : /limit/i.test(message) ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
