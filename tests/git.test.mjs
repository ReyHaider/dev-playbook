import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { changedPaths, computeFingerprint, headInfo, isTestCommit } from "../hooks/lib/git.mjs";

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), "dp git "));
}

function newRepo() {
  const dir = tempDir();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  return dir;
}

function write(dir, rel, content) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), content);
}

function commit(dir, subject, files) {
  git(dir, "add", "--", ...files);
  git(dir, "commit", "-q", "-m", subject);
}

test("a folder that is not a repository has no head and no fingerprint", () => {
  const dir = tempDir();
  assert.equal(headInfo(dir), null);
  assert.equal(computeFingerprint(dir, ["**/*"]), null);
  assert.deepEqual(changedPaths(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("a repository with no commits has no head but a fingerprint", () => {
  const dir = newRepo();
  write(dir, "a.py", "x = 1\n");
  assert.equal(headInfo(dir), null);
  assert.equal(typeof computeFingerprint(dir, ["*.py"]), "string");
  rmSync(dir, { recursive: true, force: true });
});

const testCommitCases = [
  ["test(metrics): pin recall", ["tests/test_m.py"], true],
  ["test!: x", ["tests/t.py"], true],
  ["feat: x", ["tests/t.py"], false],
  ["test: x", ["src/a.py", "tests/t.py"], false],
  ["test: x", [], false],
  ["testing: x", ["tests/t.py"], false],
];

for (const [subject, files, expected] of testCommitCases) {
  test(`isTestCommit(${JSON.stringify(subject)}, ${JSON.stringify(files)}) is ${expected}`, () => {
    assert.equal(isTestCommit({ subject, files }, ["tests/**"]), expected);
  });
}

test("the fingerprint follows watched files only", () => {
  const dir = newRepo();
  write(dir, "a.py", "x = 1\n");
  write(dir, "README.md", "hello\n");
  commit(dir, "feat: start", ["a.py", "README.md"]);
  const watch = ["*.py"];
  const original = computeFingerprint(dir, watch);

  write(dir, "README.md", "changed\n");
  assert.equal(computeFingerprint(dir, watch), original, "editing README.md");

  write(dir, "a.py", "x = 2\n");
  const edited = computeFingerprint(dir, watch);
  assert.notEqual(edited, original, "editing a.py");

  write(dir, "a.py", "x = 1\n");
  assert.equal(computeFingerprint(dir, watch), original, "restoring a.py");

  write(dir, "sub/b.py", "y = 1\n");
  assert.notEqual(computeFingerprint(dir, watch), original, "adding untracked sub/b.py");
  unlinkSync(path.join(dir, "sub/b.py"));
  assert.equal(computeFingerprint(dir, watch), original, "removing sub/b.py");

  unlinkSync(path.join(dir, "a.py"));
  assert.notEqual(computeFingerprint(dir, watch), original, "deleting a.py");
  rmSync(dir, { recursive: true, force: true });
});

test("a new commit to a watched file changes the fingerprint", () => {
  const dir = newRepo();
  write(dir, "a.py", "x = 1\n");
  commit(dir, "feat: start", ["a.py"]);
  const before = computeFingerprint(dir, ["*.py"]);
  write(dir, "a.py", "x = 2\n");
  commit(dir, "feat: change", ["a.py"]);
  assert.notEqual(computeFingerprint(dir, ["*.py"]), before);
  rmSync(dir, { recursive: true, force: true });
});

test("headInfo reports the subject and files of HEAD", () => {
  const dir = newRepo();
  write(dir, "a.py", "x = 1\n");
  commit(dir, "feat: start", ["a.py"]);
  write(dir, "tests/t.py", "def test(): pass\n");
  commit(dir, "test: t", ["tests/t.py"]);
  const head = headInfo(dir);
  assert.equal(head.subject, "test: t");
  assert.deepEqual(head.files, ["tests/t.py"]);
  assert.equal(head.sha, git(dir, "rev-parse", "HEAD"));
  rmSync(dir, { recursive: true, force: true });
});

test("headInfo on a root commit lists its files", () => {
  const dir = newRepo();
  write(dir, "a b.py", "x = 1\n");
  commit(dir, "feat: start", ["a b.py"]);
  assert.deepEqual(headInfo(dir).files, ["a b.py"]);
  rmSync(dir, { recursive: true, force: true });
});

test("headInfo works on a detached HEAD", () => {
  const dir = newRepo();
  write(dir, "a.py", "x = 1\n");
  commit(dir, "feat: start", ["a.py"]);
  const sha = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "--detach");
  assert.equal(headInfo(dir).sha, sha);
  rmSync(dir, { recursive: true, force: true });
});

test("changedPaths lists modified, staged, deleted, untracked and renamed paths", () => {
  const dir = newRepo();
  write(dir, "keep.py", "k = 1\n");
  write(dir, "mod.py", "m = 1\n");
  write(dir, "gone.py", "g = 1\n");
  write(dir, "old name.py", "o = 1\n");
  commit(dir, "feat: start", ["keep.py", "mod.py", "gone.py", "old name.py"]);
  write(dir, "mod.py", "m = 2\n");
  unlinkSync(path.join(dir, "gone.py"));
  write(dir, "deep/new file.py", "n = 1\n");
  write(dir, "staged.py", "s = 1\n");
  git(dir, "add", "staged.py");
  git(dir, "mv", "old name.py", "new name.py");
  assert.deepEqual(changedPaths(dir).sort(), ["deep/new file.py", "gone.py", "mod.py", "new name.py", "staged.py"]);
  rmSync(dir, { recursive: true, force: true });
});
