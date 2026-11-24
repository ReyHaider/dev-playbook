import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../hooks/format-file.mjs", import.meta.url));
// Writes its argument into marker.txt, so the test can see what the formatter was given.
const MARKER_FORMAT = `node -e "require('fs').writeFileSync('marker.txt', process.argv[1])" {file}`;

function project(config) {
  const dir = mkdtempSync(path.join(tmpdir(), "dp format "));
  mkdirSync(path.join(dir, ".claude"));
  mkdirSync(path.join(dir, "src"));
  writeFileSync(path.join(dir, ".claude", "dev-playbook.json"), JSON.stringify({ test: "t", watch: ["**/*"], ...config }));
  return dir;
}

function edit(dir, rel, toolName = "Edit") {
  const filePath = path.join(dir, rel);
  writeFileSync(filePath, "x\n");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: toolName, tool_input: { file_path: filePath }, cwd: dir }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  return filePath;
}

test("an edited file that matches formatGlobs is formatted", () => {
  const dir = project({ format: MARKER_FORMAT, formatGlobs: ["**/*.py"] });
  const filePath = edit(dir, "src/a.py");
  assert.equal(path.resolve(readFileSync(path.join(dir, "marker.txt"), "utf8")), path.resolve(filePath));
  rmSync(dir, { recursive: true, force: true });
});

test("a written file is formatted too", () => {
  const dir = project({ format: MARKER_FORMAT, formatGlobs: ["**/*.py"] });
  edit(dir, "src/b.py", "Write");
  assert.equal(existsSync(path.join(dir, "marker.txt")), true);
  rmSync(dir, { recursive: true, force: true });
});

test("a file that does not match formatGlobs is left alone", () => {
  const dir = project({ format: MARKER_FORMAT, formatGlobs: ["**/*.py"] });
  edit(dir, "README.md");
  assert.equal(existsSync(path.join(dir, "marker.txt")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("nothing runs when format is unset", () => {
  const dir = project({});
  edit(dir, "src/a.py");
  assert.equal(existsSync(path.join(dir, "marker.txt")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("a failing format command stays silent", () => {
  const dir = project({ format: 'node -e "process.exit(1)" {file}', formatGlobs: ["**/*.py"] });
  edit(dir, "src/a.py");
  rmSync(dir, { recursive: true, force: true });
});
