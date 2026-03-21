/**
 * Skill Commands — DVS / SKILL.md fetch + domain verification
 *
 * Fetch a SKILL.md from a URL and verify domain ownership against an ENS name.
 */

import colors from "yoctocolors";
import { resolveSkill } from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface SkillFetchOptions {
  name: string;
  url: string;
}

/**
 * Fetch a SKILL.md and verify domain ownership against an ENS name.
 */
export async function skillFetch(options: SkillFetchOptions) {
  const { name, url } = options;

  startSpinner(`Fetching SKILL.md from ${colors.cyan(url)}...`);
  const result = await resolveSkill(name, url);
  stopSpinner();

  if (!result.found) {
    console.log(colors.red("✗") + " SKILL.md not found or unreachable");
    console.log(colors.dim(`  URL: ${url}`));
    return;
  }

  console.log(colors.green("✓") + " SKILL.md fetched");
  console.log(`  ${colors.blue("URL:")} ${result.url}`);
  console.log(`  ${colors.blue("Size:")} ${result.content?.length ?? 0} bytes`);

  if (result.domainVerified) {
    console.log(`  ${colors.green("✓")} Domain verified for ${colors.cyan(name)}`);
  } else {
    console.log(`  ${colors.red("✗")} Domain NOT verified for ${name}`);
    console.log(colors.dim("  The serving domain doesn't match the ENS name."));
  }

  // Show preview of content
  if (result.content) {
    const preview = result.content.slice(0, 500);
    console.log();
    console.log(colors.blue("  Preview:"));
    for (const line of preview.split("\n").slice(0, 15)) {
      console.log(`  ${colors.dim(line)}`);
    }
    if (result.content.length > 500) {
      console.log(colors.dim(`  ... (${result.content.length - 500} more bytes)`));
    }
  }
}
