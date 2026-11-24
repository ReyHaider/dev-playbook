import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { truncated } from "../hooks/lib/messages.mjs";
import { fillTemplate, replacePlaceholder, runCommand, tail } from "../hooks/lib/run.mjs";

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), "dp run "));
}

test("a command that exits 0 passes", async () => {
  const dir = tempDir();
  const result = await runCommand('node -e "process.exit(0)"', { cwd: dir, timeoutMs: 30000 });
  assert.equal(result.status, "passed");
  assert.equal(result.exitCode, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a command that exits non-zero fails with its output", async () => {
  const dir = tempDir();
  const result = await runCommand(`node -e "console.log('x');process.exit(3)"`, { cwd: dir, timeoutMs: 30000 });
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /x/);
  rmSync(dir, { recursive: true, force: true });
});

test("stdout and stderr are both captured", async () => {
  const dir = tempDir();
  const result = await runCommand(`node -e "console.log('out');console.error('err')"`, { cwd: dir, timeoutMs: 30000 });
  assert.match(result.output, /out/);
  assert.match(result.output, /err/);
  rmSync(dir, { recursive: true, force: true });
});

test("a command that runs too long times out quickly", async () => {
  const dir = tempDir();
  const started = Date.now();
  const result = await runCommand('node -e "setTimeout(()=>{},60000)"', { cwd: dir, timeoutMs: 500 });
  assert.equal(result.status, "timeout");
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
  rmSync(dir, { recursive: true, force: true });
});

test("a timeout kills the whole process tree", async () => {
  const dir = tempDir();
  writeFileSync(
    path.join(dir, "child.cjs"),
    "setTimeout(() => require('fs').writeFileSync('late.txt', 'x'), 2000);\nsetInterval(() => {}, 1000);\n",
  );
  writeFileSync(
    path.join(dir, "parent.cjs"),
    "require('child_process').spawn(process.execPath, ['child.cjs'], { stdio: 'inherit' });\nsetInterval(() => {}, 1000);\n",
  );
  const result = await runCommand("node parent.cjs", { cwd: dir, timeoutMs: 500 });
  assert.equal(result.status, "timeout");
  await sleep(3000);
  assert.equal(existsSync(path.join(dir, "late.txt")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("a missing cwd is an error", async () => {
  const result = await runCommand('node -e "process.exit(0)"', {
    cwd: path.join(tmpdir(), "dp-run-does-not-exist-7f3a"),
    timeoutMs: 30000,
  });
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, null);
});

test("invalid UTF-8 in the output is replaced, not thrown", async () => {
  const dir = tempDir();
  const result = await runCommand(`node -e "process.stdout.write(Buffer.from([0xff,0xfe,0x0a]))"`, {
    cwd: dir,
    timeoutMs: 30000,
  });
  assert.equal(result.status, "passed");
  assert.match(result.output, /\uFFFD/);
  rmSync(dir, { recursive: true, force: true });
});

test("huge output keeps its end", async () => {
  const dir = tempDir();
  const result = await runCommand(
    `node -e "for(let i=1;i<=200000;i++)console.log('line '+i)"`,
    { cwd: dir, timeoutMs: 60000 },
  );
  assert.equal(result.status, "passed");
  const lines = tail(result.output, 60).split("\n");
  assert.equal(lines.length, 60);
  assert.equal(lines[59], "line 200000");
  assert.equal(lines[0], "line 199941");
  rmSync(dir, { recursive: true, force: true });
});

test("a check that exits but leaves a child holding its output still reports its own exit", async () => {
  const dir = tempDir();
  writeFileSync(
    path.join(dir, "parent.cjs"),
    [
      "const { spawn } = require('child_process');",
      "const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: 'inherit', detached: true });",
      "require('fs').writeFileSync('child.pid', String(c.pid));",
      "c.unref();",
      "console.log('done');",
      "process.exit(1);",
    ].join("\n"),
  );
  const started = Date.now();
  const result = await runCommand("node parent.cjs", { cwd: dir, timeoutMs: 30000 });
  const elapsed = Date.now() - started;
  try {
    process.kill(Number(readFileSync(path.join(dir, "child.pid"), "utf8")));
  } catch {}
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /done/);
  assert.ok(elapsed < 4000, `took ${elapsed} ms`);
  // Windows holds the folder for a moment after the killed child's exit.
  rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test("a command that is not installed is an error, not a failure", async () => {
  const dir = tempDir();
  const result = await runCommand("dp-definitely-not-a-command-4b2e", { cwd: dir, timeoutMs: 30000 });
  assert.equal(result.status, "error");
  rmSync(dir, { recursive: true, force: true });
});

test("tail cuts a very long line", () => {
  const out = tail(`short\n${"x".repeat(1_000_000)}`, 60);
  assert.ok(out.length < 1000, `${out.length} characters`);
  assert.ok(out.startsWith(`short\n${"x".repeat(400)}`));
  assert.ok(out.endsWith(truncated(1_000_000 - 400)));
});

test("tail treats \\r\\r\\n as one line break", () => {
  assert.equal(tail("line one\r\r\nline two\r\r\n", 60), "line one\nline two");
});

test("tail is fast on a long run of whitespace", () => {
  const started = Date.now();
  tail(`a${" ".repeat(50_000)}b${" ".repeat(50_000)}`, 60);
  assert.ok(Date.now() - started < 200);
});

test("tail keeps the last lines", () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const expected = Array.from({ length: 60 }, (_, i) => `line ${i + 41}`).join("\n");
  assert.equal(tail(text, 60), expected);
});

test("tail strips ANSI colour codes", () => {
  assert.equal(tail("\u001b[31mred\u001b[0m", 60), "red");
});

test("tail handles Windows line endings", () => {
  assert.equal(tail("a\r\nb\r\n", 60), "a\nb");
});

test("tail accepts text decoded from invalid UTF-8", () => {
  assert.doesNotThrow(() => tail(Buffer.from([0xff, 0xfe]).toString("utf8"), 60));
});

test("fillTemplate double-quotes a path with spaces", () => {
  assert.equal(fillTemplate("uv run ruff format {file}", "file", "C:/My Repo/a.py"), 'uv run ruff format "C:/My Repo/a.py"');
});

test("fillTemplate escapes characters the POSIX shell expands inside double quotes", () => {
  assert.equal(fillTemplate("fmt {file}", "file", 'a$(x)`y`"z\\.py', "linux"), 'fmt "a\\$(x)\\`y\\`\\"z\\\\.py"');
});

test("fillTemplate leaves Windows paths as they are", () => {
  assert.equal(fillTemplate("fmt {file}", "file", "C:\\My Repo\\a.py", "win32"), 'fmt "C:\\My Repo\\a.py"');
});

test("replacePlaceholder with an empty value trims the trailing space", () => {
  assert.equal(replacePlaceholder("uv run pytest -q {exclude}", "exclude", ""), "uv run pytest -q");
});

test("replacePlaceholder inserts the raw value", () => {
  assert.equal(replacePlaceholder("pytest {exclude}", "exclude", '--ignore="a b.py"'), 'pytest --ignore="a b.py"');
});

test("replacePlaceholder replaces every occurrence", () => {
  assert.equal(replacePlaceholder("{x} and {x}", "x", "y"), "y and y");
});
