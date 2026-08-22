import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { AdvisoryReport, CriteriaDocument, EvidenceBundle, documentHash } from "@sprintos/schemas";
import type { z } from "zod";

/**
 * Content-addressed off-chain document store.
 *
 * Criteria exist before the contract assigns its numeric engagement id, so
 * mutable `engagement-id/index.json` paths are the wrong identity for them.
 * Criteria and evidence are stored by the exact SHA-256 anchored on chain.
 * Different content necessarily gets a different path and cannot overwrite the
 * document a reviewer is meant to verify.
 */

const ROOT = process.env.SPRINTOS_DATA_DIR ?? join(process.cwd(), ".data");
const HASH_RE = /^[0-9a-f]{64}$/;
const ENGAGEMENT_ID_RE = /^(0|[1-9]\d*)$/;

export function normalizeDocumentHash(value: string): string {
  const hash = value.replace(/^sha256:/, "").toLowerCase();
  if (!HASH_RE.test(hash)) throw new Error("Expected a 32-byte hexadecimal document hash.");
  return hash;
}

export function validateEngagementKey(engagementId: string, idx: number): void {
  if (!ENGAGEMENT_ID_RE.test(engagementId)) throw new Error("Invalid engagement id.");
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) throw new Error("Invalid milestone index.");
}

function documentPath(kind: "criteria" | "evidence", hash: string): string {
  return join(ROOT, kind, `${normalizeDocumentHash(hash)}.json`);
}

function reportPath(engagementId: string, idx: number, evidenceHash: string): string {
  validateEngagementKey(engagementId, idx);
  return join(ROOT, "reports", `${engagementId}-${idx}-${normalizeDocumentHash(evidenceHash)}.json`);
}

async function write(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readParsed<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!existsSync(file)) return null;
  try {
    return schema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    // Corrupt or legacy data is unavailable, never trusted through a cast.
    return null;
  }
}

export interface DocumentStore {
  putCriteria(doc: CriteriaDocument): Promise<string>;
  getCriteria(hash: string): Promise<CriteriaDocument | null>;
  putEvidence(doc: EvidenceBundle): Promise<string>;
  getEvidence(hash: string): Promise<EvidenceBundle | null>;
  putReport(report: AdvisoryReport, evidenceHash: string): Promise<void>;
  getReport(engagementId: string, idx: number, evidenceHash: string): Promise<AdvisoryReport | null>;
}

export const fileStore: DocumentStore = {
  async putCriteria(doc) {
    const hash = documentHash(doc);
    await write(documentPath("criteria", hash), doc);
    return hash;
  },
  getCriteria: (hash) => readParsed(documentPath("criteria", hash), CriteriaDocument),

  async putEvidence(doc) {
    const hash = documentHash(doc);
    await write(documentPath("evidence", hash), doc);
    return hash;
  },
  getEvidence: (hash) => readParsed(documentPath("evidence", hash), EvidenceBundle),

  async putReport(report, evidenceHash) {
    await write(reportPath(report.engagement_id, report.milestone_idx, evidenceHash), report);
  },
  getReport: (engagementId, idx, evidenceHash) =>
    readParsed(reportPath(engagementId, idx, evidenceHash), AdvisoryReport),
};

export const store = fileStore;

export function matchesChainHash(doc: unknown, chainHashHex: string | null): boolean {
  if (!chainHashHex) return false;
  return documentHash(doc) === normalizeDocumentHash(chainHashHex);
}
