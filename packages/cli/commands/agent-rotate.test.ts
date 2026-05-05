import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentRotate } from "./agent-rotate";

const __dirname = dirname(fileURLToPath(import.meta.url));

function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k]!;
  }
  return fn().finally(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k]!;
    }
  });
}

test("agentRotate — missing SYNTHESIS_KEYSTORE_PASSWORD exits 2", async () => {
  await assert.rejects(
    () =>
      withEnv(
        { SYNTHESIS_KEYSTORE_PASSWORD: undefined, PINATA_JWT: "fake" },
        () => agentRotate({ alias: "x", ens: "x.eth", format: "json" }),
      ),
    /SYNTHESIS_KEYSTORE_PASSWORD/,
  );
  assert.equal(process.exitCode, 2);
  process.exitCode = 0;
});

test("agentRotate — missing PINATA_JWT exits 2", async () => {
  await assert.rejects(
    () =>
      withEnv(
        { SYNTHESIS_KEYSTORE_PASSWORD: "p", PINATA_JWT: undefined },
        () => agentRotate({ alias: "x", ens: "x.eth", format: "json" }),
      ),
    /PINATA_JWT/,
  );
  assert.equal(process.exitCode, 2);
  process.exitCode = 0;
});

test("agentRotate — missing keystore at the alias path exits 2 with a clear message", async () => {
  await assert.rejects(
    () =>
      withEnv(
        { SYNTHESIS_KEYSTORE_PASSWORD: "p", PINATA_JWT: "fake" },
        () =>
          agentRotate({
            alias: "this-alias-does-not-exist-anywhere-12345",
            ens: "x.eth",
            format: "json",
          }),
      ),
    /agent issue this-alias-does-not-exist-anywhere-12345/,
  );
  assert.equal(process.exitCode, 2);
  process.exitCode = 0;
});

test("agent-rotate schema — broadcast is the only opt-in (no --dry-run flag, regression fence from #51)", () => {
  // Same lock as agent publish: --broadcast is the only mutation
  // toggle. A future addition of --dry-run would conflict with that
  // convention and is fenced off here.
  const idx = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
  const start = idx.indexOf('agent.command("rotate"');
  assert.ok(start >= 0, "agent rotate command must be registered");
  const end = idx.indexOf("cli.command(agent)", start);
  const slice = idx.slice(start, end);
  assert.ok(/broadcast: z/.test(slice), "rotate must declare a broadcast option");
  assert.ok(!/dryRun: z|"--dry-run"/.test(slice), "rotate must NOT declare a dryRun option");
});

test("agent-rotate schema — uses ENS_PRIVATE_KEY (NOT a forked env-var name, Codex amendment 2)", () => {
  // Wallet-security memory locks the project signer to the manager EOA
  // for emilemarcelagustin.eth. agent publish uses ENS_PRIVATE_KEY;
  // agent rotate must use the same name. Test that the source file
  // doesn't mention any other env-var pattern for the signer.
  const cli = readFileSync(join(__dirname, "agent-rotate.ts"), "utf8");
  // Must reference ENS_PRIVATE_KEY via getSignerAddress (which reads it),
  // and must NOT introduce a forked name.
  assert.ok(/ENS_PRIVATE_KEY/.test(cli), "agent-rotate.ts must reference ENS_PRIVATE_KEY");
  assert.ok(
    !/OWNER_PRIVATE_KEY|SIGNER_PRIVATE_KEY|ROTATE_PRIVATE_KEY/.test(cli),
    "agent-rotate.ts must NOT introduce a forked private-key env name",
  );
});

test("RotateResult shape — newSessionKeyArtifact is the named field, not newAlias (Codex amendment 1)", () => {
  // The amendment renamed `newAlias` → `newSessionKeyArtifact`. A
  // regression fence ensures the resolver export stays renamed and the
  // CLI presenter doesn't accidentally reintroduce `newAlias`.
  const cli = readFileSync(join(__dirname, "agent-rotate.ts"), "utf8");
  assert.ok(/newSessionKeyArtifact/.test(cli), "presenter must reference newSessionKeyArtifact");
});
