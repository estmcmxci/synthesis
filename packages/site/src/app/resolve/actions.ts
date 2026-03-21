"use server";

import { resolve, type TrustProfile } from "@synthesis/resolver";

export async function resolveENSName(
  ensName: string,
  agentIds?: string[],
): Promise<{ profile: TrustProfile | null; error: string | null }> {
  try {
    const profile = await resolve(ensName, {
      knownAgentIds: agentIds?.length ? agentIds : undefined,
    });
    return { profile, error: null };
  } catch (err) {
    return {
      profile: null,
      error: err instanceof Error ? err.message : "Resolution failed",
    };
  }
}
