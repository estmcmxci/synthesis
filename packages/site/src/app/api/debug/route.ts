import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export const dynamic = "force-dynamic";

export async function GET() {
  const rpcUrl = process.env.ETH_RPC_URL ?? "NOT SET";
  const results: Record<string, string> = {
    ETH_RPC_URL: rpcUrl === "NOT SET" ? "NOT SET" : rpcUrl.slice(0, 30) + "...",
    NODE_ENV: process.env.NODE_ENV ?? "unknown",
  };

  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl === "NOT SET" ? "https://eth.drpc.org" : rpcUrl),
    });
    const address = await client.getEnsAddress({
      name: normalize("emilemarcelagustin.eth"),
    });
    results.ensAddress = address ?? "null";
  } catch (e) {
    results.ensError = (e as Error).message;
  }

  return NextResponse.json(results);
}
