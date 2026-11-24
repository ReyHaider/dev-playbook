import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../hooks/stop-check.mjs", import.meta.url));

function git(dir, ...args) {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function runHook(repo, data, stdin = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false })) {
  return spawnSync(process.execPath, [script], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_DATA: data },
  });
}

test("the stop check blocks a failing repo, then passes once fixed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dp stop "));
  const repo = path.join(root, "my repo");
  const data = path.join(root, "data");
  mkdirSync(path.join(repo, ".claude"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  writeFileSync(
    path.join(repo, ".claude", "dev-playbook.json"),
    JSON.stringify({ test: "node -e \"process.exit(require('fs').existsSync('ok')?0:1)\"", watch: ["**/*"] }),
  );
  writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "feat: start");

  const first = runHook(repo, data);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).decision, "block");

  writeFileSync(path.join(repo, "ok"), "");
  const second = runHook(repo, data);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, "");
  rmSync(root, { recursive: true, force: true });
});

test("a project without the config is silent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dp stop "));
  const result = runHook(root, path.join(root, "data"));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  rmSync(root, { recursive: true, force: true });
});

test("broken hook input becomes a visible message, and the exit code is still 0", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dp stop "));
  const result = runHook(root, path.join(root, "data"), "{not json");
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).systemMessage, /^dev-playbook: the stop-check hook failed \(/);
  rmSync(root, { recursive: true, force: true });
});
