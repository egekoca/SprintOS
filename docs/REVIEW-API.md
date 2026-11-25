# SprintOS Review API

A hackathon judging a submission against a fixed rubric is the same shape
of problem as a grant programme reviewing a milestone: a small set of
written criteria, a handful of public evidence links, and a reviewer who
has to form an opinion. This API wraps SprintOS's advisory pipeline for a
platform that is not running a SprintOS engagement at all.

## The guarantee this API makes

The response is a score, a per-criterion checklist and a recommendation —
never a decision. Nothing this endpoint returns can approve a submission,
rank one out, or move a payment. It is the same non-binding advisory report
`/api/advisory` produces for a SprintOS milestone, with the same disclaimer
field locked to `"binding": false`. A human at the calling platform reads
it the way a SprintOS reviewer does: as an aid, never an answer.

## Try it without a key

```
curl https://sprintos-ai.vercel.app/api/v1/review/demo
```

No Bearer token, no wallet, no account — this returns exactly the report
`POST /api/v1/review` would produce for the example request below, generated
from a fixed draft rather than a live model call. Same input, same
`report_id`, same `generated_at`, same `report_hash` every time:
`sha256:88f6e90eaacb0ab49b9af7cb22b39ae1f0d27c75271f51e9da5316ed20d2a610`,
score 82, `ReadyForReview`. `pnpm --filter @sprintos/advisory fixtures`
regenerates it byte for byte — see `packages/advisory/src/demo-fixture.ts`
and `packages/advisory/fixtures/04-api-demo.report.json`.

## Getting a key

Keys are issued directly, not through self-serve signup — open a
conversation with the SprintOS team. Each key is shown once, at mint time,
and is not retrievable afterward; a lost key means a new one. Each key also
carries its own per-hour rate limit, set when it is minted — a platform
judging a batch of hackathon submissions in one sitting gets a ceiling
sized for that, not a one-size-fits-all default.

## Calling it

```
POST /api/v1/review
Authorization: Bearer sk_...
Content-Type: application/json

{
  "title": "Hackathon submission rubric",
  "outcome": "A complete, judgeable submission",
  "criteria": [
    { "id": "c1", "text": "Project has a public repository with a README" },
    { "id": "c2", "text": "Project demonstrates a working demo" }
  ],
  "evidence_links": [
    { "url": "https://github.com/...", "type": "repo" },
    { "url": "https://youtube.com/...", "type": "demo" }
  ],
  "kind": "standard"
}
```

- `criteria`: 1–5 entries, each a short written check.
- `evidence_links`: 1–5 public `https://` URLs, each typed as one of
  `repo`, `commit`, `pull_request`, `test_result`, `docs`, `demo`.
- `kind`: `"standard"` (default) or `"deep"` — Deep asks the model to think
  harder and read more of what it fetched, at a higher cost per call.
- Rate limited per key at whatever ceiling was set when the key was
  minted (20/hour by default), and only one request in flight per key at
  a time.

Response is `{ "report": AdvisoryReport }` — the same schema documented in
`packages/schemas/src/report.ts`, including `report_hash` so a stored copy
can be checked for tampering later.

## What this is not

No submission, rubric, or evidence link is stored or anchored anywhere —
nothing here touches the Stellar network, a wallet, or a contract. If a
platform wants a public, verifiable record of a decision the way a
SprintOS engagement has one, that is a different integration (a real
engagement with an on-chain settlement), not this endpoint.
