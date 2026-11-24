import { loadConfig } from "./config.mjs";
import { changedPaths, computeFingerprint, headInfo, isTestCommit } from "./git.mjs";
import { compileGlob } from "./glob.mjs";
import * as messages from "./messages.mjs";
import { fillTemplate, replacePlaceholder, runCommand, tail } from "./run.mjs";
import { dataDir, readState, stateFile, writeState } from "./state.mjs";

const TAIL_LINES = 60;
const GIVE_UP_AFTER = 3;

const defaultDeps = {
  loadConfig,
  computeFingerprint,
  headInfo,
  changedPaths,
  isTestCommit,
  runCommand,
  readState,
  writeState,
  stateFile,
  dataDir,
  now: Date.now,
};

const json = (value) => ({ stdout: JSON.stringify(value) });
const silent = { stdout: "" };
const notice = (systemMessage) => json({ systemMessage });

// Decides whether a turn may end. The decision order is pinned in the M1 plan, Task 7.
export async function runStopCheck({ projectDir }, deps = {}) {
  const d = { ...defaultDeps, ...deps };

  const loaded = d.loadConfig(projectDir);
  if (loaded.status === "absent") return silent;
  if (loaded.status === "invalid") return notice(messages.invalid(loaded.error));
  const config = loaded.config;

  const fp = d.computeFingerprint(projectDir, config.watch);
  if (fp === null) return notice(messages.couldNotCheck("not a git repository"));

  const file = d.stateFile(d.dataDir(), projectDir);
  const state = d.readState(file);
  if (state.lastPassing === fp) return silent;
  if (state.block.fingerprint === fp && state.block.count >= GIVE_UP_AFTER) return notice(messages.giveUp());

  const deadline = d.now() + config.timeoutSeconds * 1000;
  const run = (command) => d.runCommand(command, { cwd: projectDir, timeoutMs: Math.max(1, deadline - d.now()) });

  const checks = [];
  if (config.static) checks.push({ label: "static", command: config.static });
  if (config.test) checks.push({ label: "test", command: replacePlaceholder(config.test, "exclude", "") });

  for (const check of checks) {
    const result = await run(check.command);
    if (result.status === "timeout" || result.status === "error") {
      return notice(messages.couldNotCheck(`${check.label} ${result.status}`));
    }
    if (result.status === "passed") continue;

    if (check.label === "test") {
      const red = await redByDesign(d, projectDir, config, run);
      if (red.status === "timeout" || red.status === "error") return notice(messages.couldNotCheck(`test ${red.status}`));
      if (red.status === "passed") {
        d.writeState(file, { lastPassing: fp, block: { fingerprint: null, count: 0 } });
        return notice(messages.redByDesign(red.sha.slice(0, 7)));
      }
    }

    const count = state.block.fingerprint === fp ? state.block.count + 1 : 1;
    d.writeState(file, { lastPassing: state.lastPassing, block: { fingerprint: fp, count } });
    return json({ decision: "block", reason: messages.block(check.label, check.command, tail(result.output, TAIL_LINES)) });
  }

  d.writeState(file, { lastPassing: fp, block: { fingerprint: null, count: 0 } });
  return silent;
}

// When HEAD is a fresh test commit and nothing outside the tests has changed, the test command
// runs again without that commit's test files. Returns {status: "skipped"} when that does not apply.
async function redByDesign(d, projectDir, config, run) {
  if (!config.exclude) return { status: "skipped" };
  const head = d.headInfo(projectDir);
  if (head === null || !d.isTestCommit(head, config.testGlobs)) return { status: "skipped" };
  const matchers = config.testGlobs.map((g) => compileGlob(g));
  const onlyTests = d.changedPaths(projectDir).every((p) => matchers.some((match) => match(p)));
  if (!onlyTests) return { status: "skipped" };

  const excluded = head.files.map((f) => fillTemplate(config.exclude, "file", f)).join(" ");
  const result = await run(replacePlaceholder(config.test, "exclude", excluded));
  return { status: result.status, sha: head.sha };
}
