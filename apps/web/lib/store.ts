import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ACTIVITY_SCHEMA_VERSION,
  ActivityLog,
  AdvisoryReport,
  CriteriaDocument,
  EvidenceBundle,
  documentHash,
  type ActivityEntry,
} from "@sprintos/schemas";
import type { z } from "zod";

/**
 * Content-addressed off-chain document store.
 *
 * Criteria exist before the contract assigns its numeric engagement id, so
 * mutable `engagement-id/index.json` paths are the wrong identity for them.
 * Criteria and evidence are stored by the exact SHA-256 anchored on chain.
 * Different content necessarily gets a different path and cannot overwrite the
 * document a reviewer is meant to verify.
 *
 * Two backends, one key space. The local filesystem is right for development
 * and for a single instance with a persistent volume. A serverless deployment
 * has neither: its filesystem is per-invocation and read-only outside `/tmp`,
 * so a criteria document written during setup would be gone by the time the
 * reviewer opens the milestone — and with it the reviewer's ability to verify
 * the hash and decide at all. Setting `BLOB_READ_WRITE_TOKEN` switches to
 * Vercel Blob, which is durable and shared across instances.
 */

const ROOT = process.env.SPRINTOS_DATA_DIR ?? join(process.cwd(), ".data");
const HASH_RE = /^[0-9a-f]{64}$/;
const ENGAGEMENT_ID_RE = /^(0|[1-9]\d*)$/;

export function normalizeDocumentHash(value: string): string {
  const hash = value.replace(/^sha256:/, "").toLowerCase();
  if (!HASH_RE.test(hash)) throw new Error("Expected a 32-byte hexadecimal document hash.");
  return hash;
}

export function validateEngagementId(engagementId: string): void {
  if (!ENGAGEMENT_ID_RE.test(engagementId)) throw new Error("Invalid engagement id.");
}

export function validateEngagementKey(engagementId: string, idx: number): void {
  validateEngagementId(engagementId);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) throw new Error("Invalid milestone index.");
}

/**
 * The key for a document, identical in both backends.
 *
 * Every segment is validated before it is joined, so a key can never escape its
 * prefix — as a path on disk or as a blob pathname.
 */
function documentKey(kind: "criteria" | "evidence", hash: string): string {
  return `${kind}/${normalizeDocumentHash(hash)}.json`;
}

function reportKey(engagementId: string, idx: number, evidenceHash: string): string {
  validateEngagementKey(engagementId, idx);
  return `reports/${engagementId}-${idx}-${normalizeDocumentHash(evidenceHash)}.json`;
}

/* The one mutable key in the store. Criteria, evidence and reports are named by
   their own content; a settlement log grows as the engagement does, so it is
   named by the engagement instead. */
function activityKey(engagementId: string): string {
  validateEngagementId(engagementId);
  return `activity/${engagementId}.json`;
}

export interface DocumentStore {
  putCriteria(doc: CriteriaDocument): Promise<string>;
  getCriteria(hash: string): Promise<CriteriaDocument | null>;
  putEvidence(doc: EvidenceBundle): Promise<string>;
  getEvidence(hash: string): Promise<EvidenceBundle | null>;
  putReport(report: AdvisoryReport, evidenceHash: string): Promise<void>;
  getReport(engagementId: string, idx: number, evidenceHash: string): Promise<AdvisoryReport | null>;
  putActivity(log: ActivityLog): Promise<void>;
  getActivity(engagementId: string): Promise<ActivityLog | null>;
}

function parse<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    // Corrupt or legacy data is unavailable, never trusted through a cast.
    return null;
  }
}

/* ------------------------------------------------------------ filesystem */

async function writeFileDoc(key: string, value: unknown): Promise<void> {
  const file = join(ROOT, key);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readFileDoc<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  const file = join(ROOT, key);
  if (!existsSync(file)) return null;
  try {
    return parse(await readFile(file, "utf8"), schema);
  } catch {
    return null;
  }
}

export const fileStore: DocumentStore = {
  async putCriteria(doc) {
    const hash = documentHash(doc);
    await writeFileDoc(documentKey("criteria", hash), doc);
    return hash;
  },
  getCriteria: (hash) => readFileDoc(documentKey("criteria", hash), CriteriaDocument),

  async putEvidence(doc) {
    const hash = documentHash(doc);
    await writeFileDoc(documentKey("evidence", hash), doc);
    return hash;
  },
  getEvidence: (hash) => readFileDoc(documentKey("evidence", hash), EvidenceBundle),

  async putReport(report, evidenceHash) {
    await writeFileDoc(reportKey(report.engagement_id, report.milestone_idx, evidenceHash), report);
  },
  getReport: (engagementId, idx, evidenceHash) =>
    readFileDoc(reportKey(engagementId, idx, evidenceHash), AdvisoryReport),

  async putActivity(log) {
    await writeFileDoc(activityKey(log.engagement_id), log);
  },
  getActivity: (engagementId) => readFileDoc(activityKey(engagementId), ActivityLog),
};

/* ----------------------------------------------------------- vercel blob */

/* Imported lazily so a filesystem deployment never loads the SDK, and so the
   package stays absent from any bundle that does not reach this branch. */
async function blob() {
  return import("@vercel/blob");
}

async function writeBlobDoc(key: string, value: unknown): Promise<void> {
  const { put } = await blob();
  await put(key, `${JSON.stringify(value, null, 2)}\n`, {
    access: "public",
    contentType: "application/json",
    /* The key is the content hash, so the name must survive verbatim and a
       repeated write is the same bytes rather than a conflict. */
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function readBlobDoc<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  const { head, BlobNotFoundError } = await blob();
  try {
    const meta = await head(key);
    const response = await fetch(meta.url, { cache: "no-store" });
    if (!response.ok) return null;
    return parse(await response.text(), schema);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export const blobStore: DocumentStore = {
  async putCriteria(doc) {
    const hash = documentHash(doc);
    await writeBlobDoc(documentKey("criteria", hash), doc);
    return hash;
  },
  getCriteria: (hash) => readBlobDoc(documentKey("criteria", hash), CriteriaDocument),

  async putEvidence(doc) {
    const hash = documentHash(doc);
    await writeBlobDoc(documentKey("evidence", hash), doc);
    return hash;
  },
  getEvidence: (hash) => readBlobDoc(documentKey("evidence", hash), EvidenceBundle),

  async putReport(report, evidenceHash) {
    await writeBlobDoc(reportKey(report.engagement_id, report.milestone_idx, evidenceHash), report);
  },
  getReport: (engagementId, idx, evidenceHash) =>
    readBlobDoc(reportKey(engagementId, idx, evidenceHash), AdvisoryReport),

  async putActivity(log) {
    await writeBlobDoc(activityKey(log.engagement_id), log);
  },
  getActivity: (engagementId) => readBlobDoc(activityKey(engagementId), ActivityLog),
};

/** Which backend this deployment is running on, for the health surface. */
export const storeBackend = process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "file";

export const store: DocumentStore = storeBackend === "blob" ? blobStore : fileStore;

/**
 * Add one settlement transaction to an engagement's log.
 *
 * Idempotent on the transaction hash: the client posts after the ledger has
 * confirmed, and a retry or a second tab must not double the entry. Read,
 * modify and write is not atomic, so a genuinely concurrent pair of writes can
 * lose one — acceptable for an index whose authority is the explorer link it
 * carries, and recoverable by resubmitting.
 */
export async function appendActivity(entry: ActivityEntry): Promise<ActivityLog> {
  const existing = await store.getActivity(entry.engagement_id);
  const entries = existing?.entries ?? [];
  if (entries.some((known) => known.tx_hash === entry.tx_hash)) {
    return existing ?? { schema_version: ACTIVITY_SCHEMA_VERSION, engagement_id: entry.engagement_id, entries };
  }
  const log = ActivityLog.parse({
    schema_version: ACTIVITY_SCHEMA_VERSION,
    engagement_id: entry.engagement_id,
    entries: [...entries, entry].slice(-60),
  });
  await store.putActivity(log);
  return log;
}

export function matchesChainHash(doc: unknown, chainHashHex: string | null): boolean {
  if (!chainHashHex) return false;
  return documentHash(doc) === normalizeDocumentHash(chainHashHex);
}
