import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// What the stop check remembers about one project between turns. passHead is the HEAD commit a
// red-by-design pass belongs to; it is null for an ordinary pass, which holds for any HEAD.
const defaultState = () => ({ lastPassing: null, passHead: null, block: { fingerprint: null, count: 0 } });

export function dataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(tmpdir(), "dev-playbook");
}

export function stateFile(dir, projectDir, platform = process.platform) {
  let key = projectDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (platform === "win32") key = key.toLowerCase();
  const id = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return path.join(dir, `state-${id}.json`);
}

const isFingerprint = (v) => v === null || typeof v === "string";

export function readState(file) {
  try {
    const s = JSON.parse(readFileSync(file, "utf8"));
    const passHead = s?.passHead ?? null;
    const valid =
      isFingerprint(s?.lastPassing) &&
      isFingerprint(passHead) &&
      isFingerprint(s?.block?.fingerprint) &&
      Number.isInteger(s.block.count) &&
      s.block.count >= 0;
    if (!valid) return defaultState();
    return { lastPassing: s.lastPassing, passHead, block: { fingerprint: s.block.fingerprint, count: s.block.count } };
  } catch {
    return defaultState();
  }
}

// Writes atomically, so a second session reading at the same moment sees the old or the new state.
export function writeState(file, state) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state)}\n`);
  try {
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
