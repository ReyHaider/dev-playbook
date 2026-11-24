import { test } from "node:test";
import assert from "node:assert/strict";
import { runStopCheck } from "../hooks/lib/stop.mjs";
import * as messages from "../hooks/lib/messages.mjs";

const EMPTY = { lastPassing: null, passHead: null, block: { fingerprint: null, count: 0 } };
const passed = { status: "passed", exitCode: 0, output: "" };
const failed = (output = "boom") => ({ status: "failed", exitCode: 1, output });

// A fake world for the stop check: every dependency is replaced, and calls are recorded.
function harness({ config, loaded, fp = "fp1", state = EMPTY, runs = [], head = null, changed = [] } = {}) {
  const calls = { commands: [], written: [] };
  let current = state;
  const deps = {
    loadConfig: () => loaded ?? { status: "ok", config: { testGlobs: ["tests/**"], timeoutSeconds: 600, ...config } },
    computeFingerprint: () => fp,
    dataDir: () => "data",
    stateFile: () => "state.json",
    readState: () => current,
    writeState: (_file, s) => {
      calls.written.push(s);
      current = s;
    },
    runCommand: async (command) => {
      calls.commands.push(command);
      const result = runs.shift();
      if (!result) throw new Error(`unexpected command: ${command}`);
      return result;
    },
    headInfo: () => head,
    changedPaths: () => changed,
  };
  return { deps, calls };
}

const run = (h) => runStopCheck({ projectDir: "/repo" }, h.deps);
const parse = (result) => JSON.parse(result.stdout);

test("absent config is silent", async () => {
  const h = harness({ loaded: { status: "absent" } });
  assert.deepEqual(await run(h), { stdout: "" });
  assert.equal(h.calls.commands.length, 0);
});

test("invalid config warns", async () => {
  const h = harness({ loaded: { status: "invalid", error: "unknown key: x" } });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.invalid("unknown key: x") });
  assert.equal(h.calls.commands.length, 0);
});

test("not a git repository warns", async () => {
  const h = harness({ config: { test: "t", watch: ["**/*"] }, fp: null });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.couldNotCheck("not a git repository") });
  assert.equal(h.calls.commands.length, 0);
});

test("unchanged fingerprint skips without running", async () => {
  const h = harness({ config: { test: "t", watch: ["**/*"] }, state: { ...EMPTY, lastPassing: "fp1" } });
  assert.deepEqual(await run(h), { stdout: "" });
  assert.equal(h.calls.commands.length, 0);
  assert.equal(h.calls.written.length, 0);
});

test("passing checks record the fingerprint and stay silent", async () => {
  const h = harness({
    config: { static: "s", test: "t", watch: ["**/*"] },
    state: { lastPassing: "old", passHead: null, block: { fingerprint: "fp1", count: 2 } },
    runs: [passed, passed],
  });
  assert.deepEqual(await run(h), { stdout: "" });
  assert.deepEqual(h.calls.commands, ["s", "t"]);
  assert.deepEqual(h.calls.written, [{ lastPassing: "fp1", passHead: null, block: { fingerprint: null, count: 0 } }]);
});

test("the normal run removes the {exclude} placeholder", async () => {
  const h = harness({
    config: { test: "uv run pytest -q {exclude}", exclude: "--ignore={file}", watch: ["**/*"] },
    runs: [passed],
  });
  await run(h);
  assert.deepEqual(h.calls.commands, ["uv run pytest -q"]);
});

test("failing static blocks with its tail", async () => {
  const output = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
  const h = harness({ config: { static: "lint", test: "t", watch: ["**/*"] }, runs: [failed(output)] });
  const result = parse(await run(h));
  assert.equal(result.decision, "block");
  assert.ok(result.reason.startsWith(messages.block("static", "lint", "")), result.reason);
  assert.ok(result.reason.endsWith("line 100"));
  assert.doesNotMatch(result.reason, /\bline 40\b/);
  assert.match(result.reason, /\bline 41\b/);
  assert.deepEqual(h.calls.commands, ["lint"], "test does not run after static fails");
});

test("failing test blocks and counts", async () => {
  const h = harness({ config: { test: "t", watch: ["**/*"] }, runs: [failed("bad")] });
  const result = parse(await run(h));
  assert.deepEqual(result, { decision: "block", reason: messages.block("test", "t", "bad") });
  assert.deepEqual(h.calls.written, [{ lastPassing: null, passHead: null, block: { fingerprint: "fp1", count: 1 } }]);
});

test("a second failure on the same fingerprint counts up", async () => {
  const h = harness({
    config: { test: "t", watch: ["**/*"] },
    state: { lastPassing: null, passHead: null, block: { fingerprint: "fp1", count: 2 } },
    runs: [failed()],
  });
  assert.equal(parse(await run(h)).decision, "block");
  assert.deepEqual(h.calls.written, [{ lastPassing: null, passHead: null, block: { fingerprint: "fp1", count: 3 } }]);
});

test("fourth stop on the same fingerprint gives up", async () => {
  const h = harness({
    config: { test: "t", watch: ["**/*"] },
    state: { lastPassing: null, passHead: null, block: { fingerprint: "fp1", count: 3 } },
  });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.giveUp() });
  assert.equal(h.calls.commands.length, 0);
});

test("a new fingerprint resets the count", async () => {
  const h = harness({
    config: { test: "t", watch: ["**/*"] },
    state: { lastPassing: null, passHead: null, block: { fingerprint: "old", count: 3 } },
    runs: [failed()],
  });
  assert.equal(parse(await run(h)).decision, "block");
  assert.deepEqual(h.calls.written, [{ lastPassing: null, passHead: null, block: { fingerprint: "fp1", count: 1 } }]);
});

test("timeout warns and does not block", async () => {
  const h = harness({
    config: { static: "s", test: "t", watch: ["**/*"] },
    runs: [{ status: "timeout", exitCode: null, output: "" }],
  });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.couldNotCheck("static timeout") });
  assert.equal(h.calls.written.length, 0);
});

test("a check that cannot start warns and does not block", async () => {
  const h = harness({ config: { test: "t", watch: ["**/*"] }, runs: [{ status: "error", exitCode: null, output: "" }] });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.couldNotCheck("test error") });
  assert.equal(h.calls.written.length, 0);
});

test("the checks share one deadline", async () => {
  const timeouts = [];
  let clock = 0;
  const h = harness({ config: { static: "s", test: "t", watch: ["**/*"], timeoutSeconds: 10 }, runs: [passed, passed] });
  h.deps.now = () => clock;
  const fake = h.deps.runCommand;
  h.deps.runCommand = async (command, opts) => {
    timeouts.push(opts.timeoutMs);
    clock += 4000;
    return fake(command, opts);
  };
  await run(h);
  assert.deepEqual(timeouts, [10000, 6000]);
});

const redHead = { sha: "abc1234def", subject: "test: new", files: ["tests/test_new.py"] };
const redConfig = { test: "pytest -q {exclude}", exclude: "--ignore={file}", watch: ["**/*"] };

test("red by design allows the stop with a note", async () => {
  const h = harness({ config: redConfig, head: redHead, changed: [], runs: [failed(), passed] });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.redByDesign("abc1234") });
  assert.equal(h.calls.commands.length, 2);
  assert.match(h.calls.commands[1], /--ignore="tests\/test_new\.py"/);
  assert.deepEqual(h.calls.written.at(-1), {
    lastPassing: "fp1",
    passHead: "abc1234def",
    block: { fingerprint: null, count: 0 },
  });
});

const redPass = { lastPassing: "fp1", passHead: "abc1234def", block: { fingerprint: null, count: 0 } };

test("a red-by-design pass holds while HEAD is still that test commit", async () => {
  const h = harness({ config: redConfig, head: redHead, state: redPass });
  assert.deepEqual(await run(h), { stdout: "" });
  assert.equal(h.calls.commands.length, 0);
});

test("a red-by-design pass does not cover a later commit with the same files", async () => {
  const h = harness({
    config: redConfig,
    head: { sha: "fff0000aaa", subject: "docs: notes", files: ["README.md"] },
    state: redPass,
    runs: [failed("still red")],
  });
  assert.deepEqual(parse(await run(h)), { decision: "block", reason: messages.block("test", "pytest -q", "still red") });
});

test("a red-by-design pass does not cover an amended commit", async () => {
  const h = harness({
    config: redConfig,
    head: { sha: "eee1111bbb", subject: "feat: claim done", files: ["tests/test_new.py"] },
    state: redPass,
    runs: [failed("still red")],
  });
  assert.equal(parse(await run(h)).decision, "block");
});

test("red by design allows uncommitted changes to test files", async () => {
  const h = harness({ config: redConfig, head: redHead, changed: ["tests/test_new.py"], runs: [failed(), passed] });
  assert.deepEqual(parse(await run(h)), { systemMessage: messages.redByDesign("abc1234") });
});

test("red by design is not applied with code changes pending", async () => {
  const h = harness({ config: redConfig, head: redHead, changed: ["src/a.py"], runs: [failed()] });
  assert.equal(parse(await run(h)).decision, "block");
  assert.equal(h.calls.commands.length, 1);
});

test("red by design is not applied when static fails", async () => {
  const h = harness({ config: { ...redConfig, static: "lint" }, head: redHead, runs: [failed()] });
  const result = parse(await run(h));
  assert.equal(result.decision, "block");
  assert.ok(result.reason.startsWith(messages.block("static", "lint", "")));
  assert.equal(h.calls.commands.length, 1);
});

test("red by design is not applied when HEAD is not a test commit", async () => {
  const h = harness({ config: redConfig, head: { ...redHead, subject: "feat: new" }, runs: [failed()] });
  assert.equal(parse(await run(h)).decision, "block");
  assert.equal(h.calls.commands.length, 1);
});

test("red by design is not applied without an exclude setting", async () => {
  const h = harness({ config: { test: "pytest -q", watch: ["**/*"] }, head: redHead, runs: [failed()] });
  assert.equal(parse(await run(h)).decision, "block");
  assert.equal(h.calls.commands.length, 1);
});

test("red by design is not applied when the other tests also fail", async () => {
  const h = harness({ config: redConfig, head: redHead, runs: [failed("first"), failed("second")] });
  const result = parse(await run(h));
  assert.deepEqual(result, { decision: "block", reason: messages.block("test", "pytest -q", "first") });
  assert.equal(h.calls.written.at(-1).block.count, 1);
});
