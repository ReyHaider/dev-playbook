import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONFIG_PATH, loadConfig } from "../hooks/lib/config.mjs";
import * as messages from "../hooks/lib/messages.mjs";

function projectWith(content) {
  const dir = mkdtempSync(path.join(tmpdir(), "dp config "));
  if (content !== undefined) {
    mkdirSync(path.join(dir, ".claude"));
    writeFileSync(path.join(dir, CONFIG_PATH), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

function load(content) {
  const dir = projectWith(content);
  try {
    return loadConfig(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const minimal = { test: "t", watch: ["**/*.py"] };

test("the config path is .claude/dev-playbook.json", () => {
  assert.equal(CONFIG_PATH, ".claude/dev-playbook.json");
});

test("a missing file is absent", () => {
  assert.deepEqual(load(undefined), { status: "absent" });
});

test("broken JSON is invalid", () => {
  const result = load("{x");
  assert.equal(result.status, "invalid");
  assert.match(result.error, /not valid JSON/);
});

test("a JSON value that is not an object is invalid", () => {
  const result = load("[]");
  assert.equal(result.status, "invalid");
  assert.match(result.error, /object/);
});

test("a missing watch is invalid", () => {
  const result = load({ test: "t" });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /watch/);
});

test("an empty watch is invalid", () => {
  const result = load({ test: "t", watch: [] });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /watch/);
});

test("neither static nor test is invalid", () => {
  const result = load({ watch: ["**/*.py"] });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /static or test/);
});

test("an unknown key is invalid", () => {
  const result = load({ ...minimal, statc: "x" });
  assert.deepEqual(result, { status: "invalid", error: "unknown key: statc" });
});

test("a minimal config loads with defaults", () => {
  const result = load(minimal);
  assert.equal(result.status, "ok");
  assert.equal(result.config.timeoutSeconds, 600);
  assert.deepEqual(result.config.testGlobs, ["tests/**"]);
  assert.equal(result.config.test, "t");
  assert.deepEqual(result.config.watch, ["**/*.py"]);
});

test("the design's example config loads unchanged", () => {
  const example = {
    static: "uv run ruff format --check . && uv run ruff check . && uv run mypy",
    test: "uv run pytest -q {exclude}",
    exclude: "--ignore={file}",
    testGlobs: ["tests/**"],
    timeoutSeconds: 600,
    watch: ["**/*.py", "pyproject.toml", "uv.lock"],
    format: "uv run ruff format {file}",
    formatGlobs: ["**/*.py"],
  };
  assert.deepEqual(load(example), { status: "ok", config: example });
});

test("timeoutSeconds above 1500 is invalid", () => {
  const result = load({ ...minimal, timeoutSeconds: 2000 });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /timeoutSeconds/);
});

test("timeoutSeconds must be a whole number of at least 1", () => {
  assert.equal(load({ ...minimal, timeoutSeconds: 0 }).status, "invalid");
  assert.equal(load({ ...minimal, timeoutSeconds: 1.5 }).status, "invalid");
  assert.equal(load({ ...minimal, timeoutSeconds: "600" }).status, "invalid");
  assert.equal(load({ ...minimal, timeoutSeconds: 1500 }).status, "ok");
});

test("test with {exclude} and no exclude is invalid", () => {
  const result = load({ test: "pytest {exclude}", watch: ["**/*.py"] });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /exclude/);
});

test("exclude without {file} is invalid", () => {
  const result = load({ test: "pytest {exclude}", exclude: "--ignore", watch: ["**/*.py"] });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /\{file\}/);
});

test("format with no formatGlobs is invalid", () => {
  const result = load({ ...minimal, format: "ruff format {file}" });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /formatGlobs/);
});

test("format without {file} is invalid", () => {
  const result = load({ ...minimal, format: "ruff format .", formatGlobs: ["**/*.py"] });
  assert.equal(result.status, "invalid");
  assert.match(result.error, /\{file\}/);
});

test("an empty command string is invalid", () => {
  assert.equal(load({ test: "", watch: ["**/*.py"] }).status, "invalid");
  assert.equal(load({ static: 5, watch: ["**/*.py"] }).status, "invalid");
});

test("absent() text", () => {
  assert.equal(messages.absent(), "dev-playbook: no .claude/dev-playbook.json in this project; checks are off.");
});

test("invalid() text", () => {
  assert.equal(messages.invalid("E"), "dev-playbook: .claude/dev-playbook.json is invalid (E); checks are off.");
});

test("block() text", () => {
  assert.equal(
    messages.block("test", "npm test", "a\nb"),
    "dev-playbook: the test check failed (npm test). Fix it before finishing. Last 60 lines:\na\nb",
  );
});

test("giveUp() text", () => {
  assert.equal(messages.giveUp(), "dev-playbook: checks are still failing on this change after 3 attempts. This is not done.");
});

test("couldNotCheck() text", () => {
  assert.equal(messages.couldNotCheck("R"), "dev-playbook: could not check (R). The change is unverified.");
});

test("redByDesign() text", () => {
  assert.equal(messages.redByDesign("abc1234"), "dev-playbook: tests from abc1234 are red by design, awaiting code.");
});

test("protectedPath() text", () => {
  assert.equal(
    messages.protectedPath("results/a.json", "Edit(/results/**)"),
    "dev-playbook: results/a.json is protected by Edit(/results/**) in the project's Claude settings. Change it through the project's own tooling, or ask the person.",
  );
});

test("internalError() text", () => {
  assert.equal(messages.internalError("stop-check", "M"), "dev-playbook: the stop-check hook failed (M); it did nothing.");
});
