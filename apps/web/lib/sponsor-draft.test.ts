import test from "node:test";
import assert from "node:assert/strict";
import { clearDraft, deadlineSeconds, formatMoment, loadDraft, saveDraft, startSeconds, type MilestoneForm } from "./sponsor-draft.ts";

/**
 * Two things here are worth guarding.
 *
 * The deadline reading ends up in the contract, where it is the moment a
 * milestone can no longer be released against. Getting it wrong by half a day
 * is not a cosmetic bug.
 *
 * The draft is JSON the page reads back and pushes straight into form state. It
 * is written by this same code today, but a stale or hand-edited copy must not
 * be able to hand the wizard a milestone with no criteria array to map over.
 */

function milestone(overrides: Partial<MilestoneForm> = {}): MilestoneForm {
  return {
    title: "Milestone 1",
    summary: "",
    criteria: ["Tests pass"],
    amount: "500",
    startDate: "2026-09-01",
    deadline: "2026-09-15",
    startTime: "",
    deadlineTime: "",
    ...overrides,
  };
}

/** A minimal localStorage, since these tests run without a browser. */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return entries;
}

test("a date with no time is due at the end of that day, not the start", () => {
  const seconds = deadlineSeconds(milestone({ deadline: "2026-09-15" }));
  const at = new Date(seconds * 1000);
  assert.equal(at.getDate(), 15);
  assert.equal(at.getHours(), 23);
  assert.equal(at.getMinutes(), 59);
});

test("a chosen time is taken exactly, in the sponsor's own timezone", () => {
  const at = new Date(deadlineSeconds(milestone({ deadline: "2026-09-15", deadlineTime: "14:30" })) * 1000);
  assert.equal(at.getHours(), 14);
  assert.equal(at.getMinutes(), 30);
});

test("adding times can order two moments inside a single day", () => {
  const sameDay = milestone({ startDate: "2026-09-15", deadline: "2026-09-15", startTime: "09:00", deadlineTime: "18:00" });
  assert.ok(startSeconds(sameDay) < deadlineSeconds(sameDay));

  const backwards = milestone({ startDate: "2026-09-15", deadline: "2026-09-15", startTime: "18:00", deadlineTime: "09:00" });
  assert.ok(deadlineSeconds(backwards) < startSeconds(backwards));
});

test("a whole-day milestone still ends after it begins", () => {
  const sameDay = milestone({ startDate: "2026-09-15", deadline: "2026-09-15" });
  assert.ok(startSeconds(sameDay) < deadlineSeconds(sameDay));
});

test("an unreadable date is reported rather than silently becoming a number", () => {
  assert.ok(Number.isNaN(deadlineSeconds(milestone({ deadline: "" }))));
});

test("the receipt shows a time only when one was chosen", () => {
  assert.equal(formatMoment("2026-09-15", ""), "2026-09-15");
  assert.equal(formatMoment("2026-09-15", "14:30"), "2026-09-15 14:30");
  assert.equal(formatMoment("", "14:30"), "—");
});

test("a saved draft comes back as it went in", () => {
  installStorage();
  const draft = {
    step: 2,
    scopeMode: "manual" as const,
    brief: "Build the thing",
    planSummary: "",
    grantTotal: "6000",
    builder: "GABC",
    reviewer: "",
    selfReview: true,
    repository: null,
    milestones: [milestone(), milestone({ title: "Escrow" })],
  };
  saveDraft(draft);

  const restored = loadDraft();
  assert.ok(restored);
  assert.equal(restored.step, 2);
  assert.equal(restored.brief, "Build the thing");
  assert.equal(restored.selfReview, true);
  assert.deepEqual(restored.milestones, draft.milestones);
});

test("an untouched form is not offered back as restored work", () => {
  installStorage();
  saveDraft({
    step: 1, scopeMode: "ai", brief: "   ", planSummary: "", grantTotal: "",
    builder: "", reviewer: "", selfReview: false, repository: null, milestones: [],
  });
  assert.equal(loadDraft(), null);
});

test("a draft older than two weeks is dropped instead of restored", () => {
  const entries = installStorage();
  saveDraft({
    step: 2, scopeMode: "manual", brief: "old", planSummary: "", grantTotal: "",
    builder: "", reviewer: "", selfReview: false, repository: null, milestones: [milestone()],
  });
  const stored = JSON.parse(entries.get("sprintos.sponsor.draft.v1")!) as { savedAt: number };
  stored.savedAt = Date.now() - 15 * 24 * 60 * 60 * 1000;
  entries.set("sprintos.sponsor.draft.v1", JSON.stringify(stored));

  assert.equal(loadDraft(), null);
  assert.equal(entries.size, 0, "the stale draft is cleared, not left to be re-read");
});

test("a damaged draft cannot hand the form a milestone it will crash on", () => {
  const entries = installStorage();
  entries.set("sprintos.sponsor.draft.v1", JSON.stringify({
    savedAt: Date.now(),
    step: 99,
    scopeMode: "nonsense",
    milestones: [{ title: "Half a milestone" }, null, 7],
    repository: { repository: "not an object" },
  }));

  const restored = loadDraft();
  assert.ok(restored);
  assert.equal(restored.step, 1, "an impossible step falls back to the first one");
  assert.equal(restored.scopeMode, "ai");
  assert.equal(restored.repository, null);
  assert.equal(restored.milestones.length, 1, "entries that are not objects are dropped");
  assert.deepEqual(restored.milestones[0].criteria, [""], "every milestone keeps a row to type into");
  assert.equal(restored.milestones[0].deadline, "");
});

test("unreadable JSON is treated as no draft at all", () => {
  const entries = installStorage();
  entries.set("sprintos.sponsor.draft.v1", "{ not json");
  assert.equal(loadDraft(), null);
});

test("discarding a draft leaves nothing behind to restore", () => {
  const entries = installStorage();
  saveDraft({
    step: 2, scopeMode: "manual", brief: "x", planSummary: "", grantTotal: "",
    builder: "", reviewer: "", selfReview: false, repository: null, milestones: [milestone()],
  });
  clearDraft();
  assert.equal(entries.size, 0);
  assert.equal(loadDraft(), null);
});

test("a browser that refuses storage does not break the form", () => {
  (globalThis as { window?: unknown }).window = {
    get localStorage(): Storage { throw new Error("blocked"); },
  };
  assert.equal(loadDraft(), null);
  assert.doesNotThrow(() => saveDraft({
    step: 1, scopeMode: "ai", brief: "", planSummary: "", grantTotal: "",
    builder: "", reviewer: "", selfReview: false, repository: null, milestones: [],
  }));
  assert.doesNotThrow(clearDraft);
});
