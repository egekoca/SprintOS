import { NextResponse } from "next/server";
import { ReviewerAttestation } from "@sprintos/schemas";
import { tallyAttestations } from "@/lib/attestation";
import { StoreUnavailableError, store, validateEngagementKey } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { canDecideRole, engagementRoles } from "@/lib/stellar/engagement-roles.server";

/**
 * Multi-reviewer attestations for one milestone's current evidence version.
 *
 * The contract lets any one authorized reviewer decide alone; this route adds
 * a stricter gate in front of that — the UI will not offer the real on-chain
 * Approve/Release step until enough of them have attested here. It is
 * deliberately not itself a way to move money: nothing here calls the
 * contract, and an attestation that never clears the threshold still leaves
 * every authorized reviewer free to decide on chain regardless. See
 * `packages/schemas/src/attestation.ts` and `lib/attestation.ts`.
 */
export const runtime = "nodejs";

const DraftAttestation = ReviewerAttestation.omit({ schema_version: true, attested_at: true });

function parseMilestoneIdx(value: string | null): number | null {
  if (value === null) return null;
  const idx = Number(value);
  return Number.isInteger(idx) ? idx : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const engagementId = url.searchParams.get("engagement_id") ?? "";
  const milestoneIdx = parseMilestoneIdx(url.searchParams.get("milestone_idx"));
  const evidenceHash = url.searchParams.get("evidence_hash") ?? "";

  if (milestoneIdx === null) {
    return NextResponse.json({ error: "Send engagement_id, milestone_idx and evidence_hash." }, { status: 400 });
  }
  try {
    validateEngagementKey(engagementId, milestoneIdx);
  } catch {
    return NextResponse.json({ error: "Invalid engagement id or milestone index." }, { status: 400 });
  }

  try {
    const [attestations, policy] = await Promise.all([
      store.listAttestations(engagementId, milestoneIdx, evidenceHash),
      store.getPolicy(engagementId),
    ]);
    const threshold = policy?.threshold ?? 1;
    return NextResponse.json({ attestations, tally: tallyAttestations(attestations, evidenceHash, threshold) });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`attestation:${requestClientKey(request)}`, 30).allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const parsed = DraftAttestation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid attestation." }, { status: 400 });
  }
  const draft = parsed.data;

  const roles = await engagementRoles(draft.engagement_id);
  if (!roles) {
    return NextResponse.json({ error: "That engagement could not be read from the network." }, { status: 409 });
  }
  if (!canDecideRole(roles, draft.reviewer)) {
    return NextResponse.json(
      { error: "That wallet is not an authorized reviewer on this engagement." },
      { status: 403 },
    );
  }

  const attestation = ReviewerAttestation.parse({
    ...draft,
    schema_version: "1.0.0",
    attested_at: new Date().toISOString(),
  });

  try {
    await store.putAttestation(attestation);
    const [attestations, policy] = await Promise.all([
      store.listAttestations(draft.engagement_id, draft.milestone_idx, draft.evidence_hash),
      store.getPolicy(draft.engagement_id),
    ]);
    const threshold = policy?.threshold ?? 1;
    return NextResponse.json({
      attestations,
      tally: tallyAttestations(attestations, draft.evidence_hash, threshold),
    });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The attestation could not be stored." }, { status: 500 });
  }
}
