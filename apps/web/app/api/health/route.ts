import { NextResponse } from "next/server";
import { rpc as stellarRpc } from "@stellar/stellar-sdk";
import { NETWORK, SETTLEMENT_CONTRACT_ID, USDC_SAC_ID } from "@/lib/stellar/config";
import { storeBackend } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC_TIMEOUT_MS = 5_000;
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function checkRpc(): Promise<{ status: "ok" | "error"; detail?: string }> {
  const server = new stellarRpc.Server(NETWORK.rpcUrl, {
    allowHttp: NETWORK.rpcUrl.startsWith("http://"),
  });
  try {
    const health = await withTimeout(server.getHealth(), RPC_TIMEOUT_MS);
    return health.status === "healthy"
      ? { status: "ok" }
      : { status: "error", detail: "RPC reported an unhealthy node." };
  } catch {
    return { status: "error", detail: "RPC did not answer the health check." };
  }
}

/**
 * Public, non-secret deployment diagnostics.
 *
 * This endpoint intentionally reports presence and reachability only. It never
 * returns the Blob token, OpenAI key, RPC URL, or any wallet material.
 */
export async function GET() {
  const rpc = await checkRpc();
  const storageReady = storeBackend === "blob" || !process.env.VERCEL;
  const publicUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim());
  const publicUrlReady = publicUrlConfigured || !process.env.VERCEL;
  const contractConfigured = CONTRACT_ID_RE.test(SETTLEMENT_CONTRACT_ID);
  const assetConfigured = CONTRACT_ID_RE.test(USDC_SAC_ID);
  const coreReady = rpc.status === "ok" && contractConfigured && assetConfigured && storageReady && publicUrlReady;

  return NextResponse.json(
    {
      status: coreReady ? "ok" : "degraded",
      checked_at: new Date().toISOString(),
      network: "testnet",
      rpc,
      settlement_contract: { configured: contractConfigured },
      settlement_asset: { configured: assetConfigured },
      storage: {
        backend: storeBackend,
        configured: storageReady,
        required_on_vercel: true,
      },
      public_url: {
        configured: publicUrlConfigured,
        required_on_vercel: true,
      },
      advisory: {
        configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        optional: true,
      },
    },
    { status: coreReady ? 200 : 503 },
  );
}
