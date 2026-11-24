import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protectedPath } from "../hooks/lib/messages.mjs";

const script = fileURLToPath(new URL("../hooks/protect-paths.mjs", import.meta.url));

function project({ config = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "dp protect "));
  mkdirSync(path.join(dir, ".claude"));
  writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ permissions: { deny: ["Edit(/results/**)"] } }));
  if (config) writeFileSync(path.join(dir, ".claude", "dev-playbook.json"), JSON.stringify({ test: "t", watch: ["**/*"] }));
  return dir;
}

function runHook(dir, toolName, command) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: toolName, tool_input: { command }, cwd: dir }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

test("a shell write to a protected path is denied with the reason", () => {
  const dir = project();
  const result = runHook(dir, "Bash", "echo x > results/a.json");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: protectedPath("results/a.json", "Edit(/results/**)"),
    },
  });
  rmSync(dir, { recursive: true, force: true });
});

test("PowerShell commands are checked too", () => {
  const dir = project();
  const result = runHook(dir, "PowerShell", "Set-Content -Path results\\a.json -Value x");
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  rmSync(dir, { recursive: true, force: true });
});

test("a read of a protected path is allowed silently", () => {
  const dir = project();
  const result = runHook(dir, "Bash", "cat results/a.json");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  rmSync(dir, { recursive: true, force: true });
});

test("without the config file the hook does nothing", () => {
  const dir = project({ config: false });
  const result = runHook(dir, "Bash", "echo x > results/a.json");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  rmSync(dir, { recursive: true, force: true });
});
