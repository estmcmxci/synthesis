import { NextResponse } from "next/server";
import { resolve } from "@synthesis/resolver";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, string> = {
    ETH_RPC_URL: process.env.ETH_RPC_URL ? process.env.ETH_RPC_URL.slice(0, 30) + "..." : "NOT SET",
    NODE_ENV: process.env.NODE_ENV ?? "unknown",
  };

  try {
    const profile = await resolve("emilemarcelagustin.eth");
    results.address = profile.address ?? "null";
    results.personhood = String(profile.personhood.verified);
    results.trustScore = profile.trustScore;
  } catch (e) {
    results.resolveError = (e as Error).message;
  }

  return NextResponse.json(results);
}
