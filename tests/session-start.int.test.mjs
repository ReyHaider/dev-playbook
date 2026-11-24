import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as messages from "../hooks/lib/messages.mjs";

const script = fileURLToPath(new URL("../hooks/session-start.mjs", import.meta.url));

function runIn(config) {
  const dir = mkdtempSync(path.join(tmpdir(), "dp session "));
  if (config !== undefined) {
    mkdirSync(path.join(dir, ".claude"));
    writeFileSync(path.join(dir, ".claude", "dev-playbook.json"), JSON.stringify(config));
  }
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: dir }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("without the config, one line says the checks are off", () => {
  assert.equal(runIn(undefined), messages.absent());
});

test("an invalid config says why the checks are off", () => {
  assert.equal(runIn({ test: "t" }), messages.invalid("watch must be a non-empty list of globs"));
});

test("a valid config prints nothing", () => {
  assert.equal(runIn({ test: "t", watch: ["**/*"] }), "");
});
