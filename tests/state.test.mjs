import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataDir, readState, stateFile, writeState } from "../hooks/lib/state.mjs";

const DEFAULT = { lastPassing: null, block: { fingerprint: null, count: 0 } };

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), "dp state "));
}

test("a missing file reads as the default state", () => {
  const dir = tempDir();
  assert.deepEqual(readState(path.join(dir, "state.json")), DEFAULT);
  rmSync(dir, { recursive: true, force: true });
});

test("a corrupt file reads as the default state", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  writeFileSync(file, "{not json");
  assert.deepEqual(readState(file), DEFAULT);
  rmSync(dir, { recursive: true, force: true });
});

test("a file of the wrong shape reads as the default state", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  writeFileSync(file, JSON.stringify({ lastPassing: 5, block: { fingerprint: "x", count: "3" } }));
  assert.deepEqual(readState(file), DEFAULT);
  writeFileSync(file, "null");
  assert.deepEqual(readState(file), DEFAULT);
  rmSync(dir, { recursive: true, force: true });
});

test("a written state reads back the same, and leaves no temporary file", () => {
  const dir = tempDir();
  const file = path.join(dir, "nested", "state.json");
  const state = { lastPassing: "abc", block: { fingerprint: "def", count: 2 } };
  writeState(file, state);
  assert.deepEqual(readState(file), state);
  writeState(file, DEFAULT);
  assert.deepEqual(readState(file), DEFAULT);
  assert.deepEqual(readdirSync(path.dirname(file)), ["state.json"]);
  rmSync(dir, { recursive: true, force: true });
});

test("Windows spellings of one project share a state file", () => {
  assert.equal(stateFile("d", "C:\\Dev\\Repo", "win32"), stateFile("d", "c:/dev/repo/", "win32"));
});

test("Linux treats differently cased paths as different projects", () => {
  assert.notEqual(stateFile("d", "C:\\Dev\\Repo", "linux"), stateFile("d", "c:/dev/repo/", "linux"));
});

test("the state file is named from a 16-hex-digit hash in the given folder", () => {
  const file = stateFile(path.join("x", "y"), "/home/u/repo", "linux");
  assert.equal(path.dirname(file), path.join("x", "y"));
  assert.match(path.basename(file), /^state-[0-9a-f]{16}\.json$/);
});

test("the data folder is CLAUDE_PLUGIN_DATA, else a dev-playbook folder in the temp folder", () => {
  const saved = process.env.CLAUDE_PLUGIN_DATA;
  try {
    process.env.CLAUDE_PLUGIN_DATA = path.join("p", "data");
    assert.equal(dataDir(), path.join("p", "data"));
    delete process.env.CLAUDE_PLUGIN_DATA;
    assert.equal(dataDir(), path.join(tmpdir(), "dev-playbook"));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = saved;
  }
});
