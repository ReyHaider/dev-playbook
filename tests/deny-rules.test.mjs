import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProtectedRules } from "../hooks/lib/deny-rules.mjs";

function project(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "dp deny "));
  mkdirSync(path.join(dir, ".claude"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, ".claude", name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const deny = (...rules) => ({ permissions: { deny: rules } });

test("both settings files are merged, keeping only Edit rules", () => {
  const dir = project({
    "settings.json": deny("Edit(/results/**)", "Bash(rm *)", "Read(./.env)"),
    "settings.local.json": deny("Edit(data/test.lock)"),
  });
  assert.deepEqual(
    loadProtectedRules(dir).map((r) => r.rule),
    ["Edit(/results/**)", "Edit(data/test.lock)"],
  );
  rmSync(dir, { recursive: true, force: true });
});

test("Edit(/results/**) matches files under results", () => {
  const dir = project({ "settings.json": deny("Edit(/results/**)") });
  const [rule] = loadProtectedRules(dir);
  assert.equal(rule.match("results/a.json"), true);
  assert.equal(rule.match("data/results/a.json"), false);
  rmSync(dir, { recursive: true, force: true });
});

test("x and ./x are anchored at the project root", () => {
  const dir = project({ "settings.json": deny("Edit(data/test.lock)", "Edit(./b.txt)") });
  const [lock, b] = loadProtectedRules(dir);
  assert.equal(lock.match("data/test.lock"), true);
  assert.equal(lock.match("sub/data/test.lock"), false);
  assert.equal(b.match("b.txt"), true);
  assert.equal(b.match("sub/b.txt"), false);
  rmSync(dir, { recursive: true, force: true });
});

test("absolute and home patterns are skipped", () => {
  const dir = project({ "settings.json": deny("Edit(//abs/x)", "Edit(~/x)") });
  assert.deepEqual(loadProtectedRules(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("missing settings files give no rules", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dp deny "));
  assert.deepEqual(loadProtectedRules(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("an unparsable settings.local.json still lets settings.json's rules load", () => {
  const dir = project({ "settings.json": deny("Edit(/results/**)"), "settings.local.json": "{broken" });
  assert.deepEqual(loadProtectedRules(dir).map((r) => r.rule), ["Edit(/results/**)"]);
  rmSync(dir, { recursive: true, force: true });
});

test("settings without permissions, or with odd entries, give no rules", () => {
  const dir = project({ "settings.json": { model: "x" }, "settings.local.json": { permissions: { deny: [5, null, "Edit()"] } } });
  assert.deepEqual(loadProtectedRules(dir), []);
  rmSync(dir, { recursive: true, force: true });
});
