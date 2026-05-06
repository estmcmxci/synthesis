import { test } from "node:test";
import assert from "node:assert/strict";
import { runRuntimeSuite } from "./suite.ts";

const LIVE = process.env.CONFORMANCE_LIVE === "1";

test(
  "runtime suite — emilemarcelagustin.eth (live)",
  { skip: !LIVE && "set CONFORMANCE_LIVE=1 to run against the live deployment" },
  async () => {
    const { cases, raw } = await runRuntimeSuite({
      ensName: "emilemarcelagustin.eth",
      probeSign: true,
    });

    assert.equal(
      raw.verified,
      true,
      `expected verified=true; errors=[${raw.errors.join("; ")}]`,
    );

    for (const c of cases) {
      assert.notEqual(
        c.outcome,
        "fail",
        `${c.id} failed: ${c.detail ?? "no detail"}`,
      );
    }

    const passed = cases.filter((c) => c.outcome === "pass").length;
    assert.equal(passed, 6, `expected 6 layers to pass, got ${passed}`);
  },
);
