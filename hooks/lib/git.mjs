import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import { compileGlob } from "./glob.mjs";

// The project folder is assumed to be the repository's top level, so paths from git and the
// config's globs share one root.

function git(cwd, args, input) {
  return execFileSync("git", ["--no-optional-locks", ...args], {
    cwd,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
  });
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function topLevel(projectDir) {
  const out = tryGit(projectDir, ["rev-parse", "--show-toplevel"]);
  return out === null ? null : out.trim();
}

function headSha(root) {
  const out = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  return out === null ? null : out.trim();
}

const splitZ = (out) => out.split("\0").filter((field) => field !== "");

export function headInfo(projectDir) {
  const root = topLevel(projectDir);
  if (root === null) return null;
  const sha = headSha(root);
  if (sha === null) return null;
  const subject = git(root, ["log", "-1", "--format=%s", "HEAD"]).replace(/\n$/, "");
  const files = splitZ(git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "-z", "HEAD"]));
  return { sha, subject, files };
}

export function changedPaths(projectDir) {
  const root = topLevel(projectDir);
  if (root === null) return [];
  const fields = splitZ(git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const xy = fields[i].slice(0, 2);
    paths.push(fields[i].slice(3));
    // A rename or copy is followed by its original path, which is not a separate entry.
    if (/[RC]/.test(xy)) i++;
  }
  return paths;
}

const TEST_SUBJECT = /^test(\([^)]*\))?!?:/;

export function isTestCommit(head, testGlobs) {
  if (!TEST_SUBJECT.test(head.subject) || head.files.length === 0) return false;
  const matchers = testGlobs.map((g) => compileGlob(g));
  return head.files.every((file) => matchers.some((match) => match(file)));
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// A hash of the watched files as committed in HEAD plus their uncommitted changes.
export function computeFingerprint(projectDir, watch) {
  const root = topLevel(projectDir);
  if (root === null) return null;
  const matchers = watch.map((g) => compileGlob(g));
  const watched = (p) => matchers.some((match) => match(p));
  const hash = createHash("sha256");

  // ls-tree rejects :(glob) pathspecs, so the tree is listed in full and filtered here.
  if (headSha(root) !== null) {
    for (const entry of splitZ(git(root, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]))) {
      if (watched(entry.slice(entry.indexOf("\t") + 1))) hash.update(`${entry}\0`);
    }
  }
  hash.update("\0changes\0");

  const changed = changedPaths(root).filter(watched).sort();
  const present = changed.filter((p) => isFile(path.join(root, p)));
  const blobs = present.length === 0 ? [] : git(root, ["hash-object", "--stdin-paths"], `${present.join("\n")}\n`).trim().split("\n");
  const blobOf = new Map(present.map((p, i) => [p, blobs[i]]));
  for (const p of changed) hash.update(`${p}\0${blobOf.get(p) ?? "deleted"}\0`);
  return hash.digest("hex");
}
