# M1: Plugin Core Implementation Plan

> **For agentic workers:** execute with superpowers:executing-plans, inline ("Native"), per design
> D11. Use a fresh build session: Sonnet 5.5 at medium effort for Tasks 1 to 10, and Opus 5.5 at
> medium for Task 11 (skill writing needs judgment; also load superpowers:writing-skills).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a working, installed `dev-playbook` plugin: the dev-process skill, the
conflict-reviewer agent, the four enforcement hooks with tests, and the usage report. Also the
personal settings change. These are rollout steps 1 and 2 of the design (§5.6).

**Architecture:** hooks are small Node entry scripts over pure library modules in
`hooks/lib/`. Each library takes its inputs explicitly (project folder, config, injected
dependencies) so it can be tested without Claude Code. The skill and agent are Markdown. The
usage report is a stand-alone Python script.

**Tech stack:** Node 24 (ESM, standard library only, `node:test`), Python 3.14 (standard
library only, `unittest`), git, Claude Code 2.1.322+.

**Spec:** [docs/specs/2026-11-24-dev-process-design.md](../specs/2026-11-24-dev-process-design.md)
(decisions D1 to D18 approved 2026-11-24). Evidence:
[docs/research/2026-11-24-process-research.md](../research/2026-11-24-process-research.md).

**Scope.** This plan covers M1 only. Following the playbook's rule that plans are written just
before the work, each later milestone gets its own plan when it starts (see "Later milestones"
at the end).

## Global Constraints

- **Runtimes:** Node 24 or later, `.mjs` modules, standard library only, no npm dependencies
  (D2). Python 3.14 standard library only, for `tools/`.
- **Platforms:** Windows 11 (PowerShell 5.1 and Git Bash) and Linux. Paths may contain spaces
  and backslashes.
- **Hooks do nothing in a project without `.claude/dev-playbook.json`,** apart from the
  one-line SessionStart notice. The project is `$CLAUDE_PROJECT_DIR`, falling back to the
  stdin `cwd`.
- **A hook never breaks a turn.** Every hook exits 0. An internal error becomes a visible
  `systemMessage` that starts with `dev-playbook:`.
- **User-facing messages live in one home,** `hooks/lib/messages.mjs`, and tests pin their
  exact text.
- **Stop check:**
  - tail of 60 lines;
  - give up after 3 blocks on the same fingerprint;
  - total check timeout 600 s by default, 1,500 s at most;
  - the Stop hook timeout in `hooks.json` is 1,800 s.
- **Config commands** run through the platform shell (`cmd.exe` on Windows, `/bin/sh` on Linux).
  They may use only `&&` and double quotes, and placeholders are filled with double-quoted paths.
- **Context budget:** the plugin's always-on context stays under about 1,000 tokens
  (`claude plugin details`).
- **Commits** follow Conventional Commits, authored with the personal identity (`ReyHaider`,
  from `C:/dev/personal/.gitconfig-personal`), with no AI attribution anywhere.
  - Per design D3, each task is a `test(...)` commit first, holding only test files, then
    `feat(...)` or `fix(...)` commits.
  - Stage files by explicit path, and chain `git add … && git commit`.
- **Line endings:** LF in the repo and the working copy.
- **Publishing:** never create the GitHub repo, push, or open a pull request without asking
  Ajlal first.

## Review Focus

1. **Paths with spaces and backslashes:** project folders like `C:\dev\My Repo` and absolute
   Windows paths in tool input must match rules and be quoted when filled into commands. Tests
   are added to Tasks 2, 4 and 8.
2. **Repos in odd states** (not a git repo, no commits yet, detached HEAD) must not crash the
   stop check: it skips or warns. Tests are in Tasks 5 and 7.
3. **A check command that hangs or spawns children** (`uv` starting `python`) must have its
   whole process tree killed at the timeout, on Windows too. Test in Task 4.
4. **Huge or coloured output** (thousands of lines, ANSI codes, invalid UTF-8) must give a clean
   60-line tail. Test in Task 4.
5. **Two sessions in one repo, or a corrupted state file,** must be handled: state writes are
   atomic, and corrupt state reads as empty. Test in Task 6.

---

## File structure

```
dev-playbook/
├─ .claude-plugin/plugin.json            manifest (Task 1)
├─ .claude-plugin/marketplace.json       local marketplace, if Task 12 chooses it
├─ .gitattributes  .gitignore  package.json  README.md  CLAUDE.md
├─ .github/workflows/test.yml            node --test and python unittest, Linux and Windows
├─ hooks/
│  ├─ hooks.json                         registration (Task 9)
│  ├─ session-start.mjs  stop-check.mjs  protect-paths.mjs  format-file.mjs   entry scripts
│  └─ lib/
│     ├─ messages.mjs                    every user-facing string
│     ├─ glob.mjs  paths.mjs             matching and path normalising
│     ├─ config.mjs                      .claude/dev-playbook.json
│     ├─ run.mjs                         commands, timeouts, tails
│     ├─ git.mjs                         HEAD, changes, fingerprint
│     ├─ state.mjs                       per-project state file
│     ├─ stop.mjs                        stop-check decisions
│     ├─ deny-rules.mjs  shell-writes.mjs   protected paths
│     └─ io.mjs                          read stdin JSON, write output
├─ skills/dev-process/SKILL.md, references/plan-template.md
├─ agents/conflict-reviewer.md
├─ tools/usage_report.py
├─ tests/  (*.test.mjs, tools/test_usage_report.py, fixtures/)
└─ docs/   specs/, research/, plans/, OPEN-WORK.md
```

`tools/usage_report.py` uses an underscore, not the design's `usage-report.py`, so tests can
import it (my call).

---

### Task 1: Bootstrap the repo

**Files:**
- Create: `.gitattributes` (`* text=auto eol=lf`), `.gitignore` (`node_modules/`,
  `__pycache__/`, `*.tmp`, `.claude/settings.local.json`)
- Create: `package.json`: `"type": "module"`, `"private": true`, `"engines": {"node": ">=24"}`,
  scripts `"test": "node --test"`. No dependencies.
- Create: `.claude-plugin/plugin.json`: `name` `dev-playbook`, `version` `0.1.0`,
  `description` "Ajlal's development process: session rules, test-first checks, and hooks
  that enforce them", `author` `ReyHaider`.
- Create: `CLAUDE.md` for developing this repo, under 60 lines. It covers:
  - what the repo is;
  - the commands `npm test` and `python -m unittest discover -s tests/tools`;
  - Node stdlib only, and Windows plus Linux;
  - messages only in `messages.mjs`;
  - the D3 commit form;
  - no AI attribution;
  - never push without asking.
- Create: `README.md` skeleton: what it is, install (filled in at Task 12), the config file
  (filled in at Task 9).
- Create: `docs/OPEN-WORK.md` listing M2 to M5 from "Later milestones".
- Create: `.github/workflows/test.yml`:
  - `ubuntu-latest`;
  - `actions/checkout` and `actions/setup-node` (Node 24), each pinned by full commit SHA with
    a version comment;
  - `permissions: contents: read`;
  - the step `npm test`;
  - `timeout-minutes: 5`.

  The Python step is added in Task 10: Python 3.12 and later exit non-zero when no tests run.
- Test: `tests/manifest.test.mjs`
- Commit as well: the existing `docs/specs/`, `docs/research/` (with `scripts/`) and this plan.

- [x] **Step 1: `git init -b main` in `C:/dev/personal/dev-playbook`.** Verify with
  `git config user.name` (expect `ReyHaider`) and `git config user.email` (expect the personal
  address from `.gitconfig-personal`, not the work one).
- [x] **Step 2: Write `tests/manifest.test.mjs`:** `test("manifest names the plugin")` parses
  `.claude-plugin/plugin.json` and asserts `name === "dev-playbook"`, that `version` matches
  `/^\d+\.\d+\.\d+$/`, and that `description` is non-empty.
- [x] **Step 3: Run `npm test`.** Expect FAIL (no manifest).
- [x] **Step 4: Create the files above.**
- [x] **Step 5: Run `npm test`.** Expect PASS. Then run `git ls-files --eol` after staging and
  expect `i/lf` throughout.
- [x] **Step 6: Commit on `main`:**
  `git add <each path> && git commit -m "chore: bootstrap the plugin repo with its design and plan"`.
  This bootstrap is the only task that is not split into test and code commits, because it
  creates the test runner itself.
- [x] **Step 7: `git switch -c m1/plugin-core`.** All later tasks commit on this branch.

### Task 2: Glob matching and project-relative paths

**Files:** create `hooks/lib/glob.mjs`, `hooks/lib/paths.mjs`; test
`tests/glob.test.mjs`, `tests/paths.test.mjs`.

**Interfaces (produces):**
- `compileGlob(pattern: string, opts?: {caseInsensitive?: boolean}): (relPath: string) => boolean`.
  `caseInsensitive` defaults to `process.platform === "win32"`.
  - `relPath` uses forward slashes, is relative to the project, and has no leading `./`.
  - A leading `/` or `./` anchors the pattern at the root.
  - A pattern with no inner `/` matches at any depth.
  - `*` and `?` do not cross `/`; `**` spans folders.
  - `x/**` also matches `x` itself.
- `toProjectRelative(projectDir: string, p: string): string | null`: forward slashes, relative
  to `projectDir`, or `null` when outside it. Use `path.win32` when `projectDir` starts with a
  drive letter, otherwise `path.posix`, so the Windows cases also run on Linux CI.

- [x] **Step 1: Write the table tests.**
  - `compileGlob`:

    | Pattern | Path | Option | Expect |
    |---|---|---|---|
    | `*.py` | `a/b/c.py` | | true |
    | `*.py` | `a/b/c.pyc` | | false |
    | `/results/**` | `results/run-1.json` | | true |
    | `/results/**` | `results` | | true |
    | `/results/**` | `data/results/x.json` | | false |
    | `results/**` | `results/x` | | true |
    | `tests/**` | `tests/unit/test_a.py` | | true |
    | `**/*.py` | `x.py` | | true |
    | `data/test.lock` | `data/test.lock` | | true |
    | `data/test.lock` | `data/test.lockx` | | false |
    | `pyproject.toml` | `sub/pyproject.toml` | | true |
    | `src/*.ts` | `src/a/b.ts` | | false |
    | `/Results/**` | `results/a` | `{caseInsensitive: true}` | true |
    | `/Results/**` | `results/a` | `{caseInsensitive: false}` | false |

  - `toProjectRelative`:

    | Project | Path | Expect |
    |---|---|---|
    | `C:\dev\My Repo` | `C:\dev\My Repo\results\a.json` | `results/a.json` |
    | `C:\dev\My Repo` | `c:/dev/my repo/results/a.json` | `results/a.json` |
    | `C:\dev\My Repo` | `D:\x\a.json` | `null` |
    | `/home/u/repo` | `/home/u/repo/data/x` | `data/x` |
    | `/home/u/repo` | `./results/a.json` | `results/a.json` |
- [x] **Step 2: Run `npm test`.** Expect FAIL (modules missing). Commit:
  `test(hooks): pin glob and path matching`.
- [x] **Step 3: Implement both.** `compileGlob` translates the pattern to a `RegExp` once.
- [x] **Step 4: Run `npm test`.** Expect PASS. Commit:
  `feat(hooks): match globs and project-relative paths`.

### Task 3: The project config

**Files:** create `hooks/lib/config.mjs`, `hooks/lib/messages.mjs`; test
`tests/config.test.mjs`.

**Interfaces (produces):**
- `CONFIG_PATH = ".claude/dev-playbook.json"`
- `loadConfig(projectDir: string)` returns one of:
  - `{status: "absent"}`
  - `{status: "invalid", error: string}`
  - `{status: "ok", config: Config}`
- `Config` fields:
  - `static?: string` and `test?: string`: at least one is required.
  - `exclude?: string`: must contain `{file}`; required when `test` contains `{exclude}`.
  - `testGlobs: string[]`: default `["tests/**"]`.
  - `watch: string[]`: required, non-empty.
  - `timeoutSeconds: number`: an integer from 1 to 1500, default 600.
  - `format?: string`: must contain `{file}`.
  - `formatGlobs?: string[]`: required when `format` is set.
  - Any other key makes the config invalid.
- `messages.mjs` exports these functions, with this exact text:

  | Function | Text |
  |---|---|
  | `absent()` | `dev-playbook: no .claude/dev-playbook.json in this project; checks are off.` |
  | `invalid(error)` | `dev-playbook: .claude/dev-playbook.json is invalid (${error}); checks are off.` |
  | `block(label, command, tail)` | `dev-playbook: the ${label} check failed (${command}). Fix it before finishing. Last 60 lines:\n${tail}` |
  | `giveUp()` | `dev-playbook: checks are still failing on this change after 3 attempts. This is not done.` |
  | `couldNotCheck(reason)` | `dev-playbook: could not check (${reason}). The change is unverified.` |
  | `redByDesign(sha7)` | `dev-playbook: tests from ${sha7} are red by design, awaiting code.` |
  | `protectedPath(path, rule)` | `dev-playbook: ${path} is protected by ${rule} in the project's Claude settings. Change it through the project's own tooling, or ask the person.` |
  | `internalError(hook, message)` | `dev-playbook: the ${hook} hook failed (${message}); it did nothing.` |

- [x] **Step 1: Write the tests.** Each writes a config into a temp folder.
  - `absent` when the file is missing.
  - `{x` gives `invalid` with an error containing `not valid JSON`.
  - A missing `watch` gives an error containing `watch`.
  - Neither `static` nor `test` gives an error containing `static or test`.
  - The key `statc` gives the error `unknown key: statc`.
  - `{"test":"t","watch":["**/*.py"]}` loads with `timeoutSeconds === 600` and
    `testGlobs` deep-equal to `["tests/**"]`.
  - `timeoutSeconds: 2000` is invalid.
  - `test` containing `{exclude}` with no `exclude` is invalid.
  - `format` with no `formatGlobs` is invalid.
  - Each `messages` function returns exactly the text above (one assertion each).
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin the config file rules and messages`.
- [x] **Step 3: Implement both.**
- [x] **Step 4: Run `npm test`.** Expect PASS. Commit: `feat(hooks): load and validate the project config`.

### Task 4: Running commands

**Files:** create `hooks/lib/run.mjs`; test `tests/run.test.mjs`.

**Interfaces (produces):**
- `runCommand(command: string, opts: {cwd: string, timeoutMs: number})` returns
  `Promise<{status: "passed" | "failed" | "timeout" | "error", exitCode: number | null, output: string}>`.
  - `shell: true`, with stdout and stderr combined in arrival order and decoded as UTF-8 with
    replacement characters.
  - On timeout, kill the whole tree: `taskkill /pid <pid> /T /F` on Windows; on Linux, spawn
    `detached` and `process.kill(-pid, "SIGKILL")`.
  - `"error"` means the process could not start (for example, a missing `cwd`).
- `tail(text: string, lines: number): string`: strips ANSI escape sequences, then keeps the
  last `lines` lines.
- `replacePlaceholder(template: string, name: string, raw: string): string`: replaces every
  `{name}` with `raw` exactly, then trims trailing spaces. Used for `{exclude}`, whose value
  is already a list of quoted arguments.
- `fillTemplate(template: string, name: string, value: string): string`: the same, but with
  `"value"` in double quotes. Used for single paths (`{file}`).

- [x] **Step 1: Write the tests.**
  - `node -e "process.exit(0)"` gives `passed`, exit code 0.
  - `node -e "console.log('x');process.exit(3)"` gives `failed`, exit code 3, and the output
    includes `x`.
  - `node -e "setTimeout(()=>{},60000)"` with `timeoutMs: 500` gives `timeout` and resolves in
    under 5 s.
  - **Tree kill:**
    - The command starts a non-detached child that writes `late.txt` into the temp `cwd` after
      2 s, then sleeps.
    - Run it with `timeoutMs: 500`, then wait 3 s.
    - Assert `late.txt` does not exist.
  - A missing `cwd` gives `error`.
  - **`tail`:**
    - 100 lines give exactly lines 41 to 100.
    - `"\u001b[31mred\u001b[0m"` gives `red`.
    - A buffer holding invalid UTF-8 (`0xff 0xfe`) does not throw.
  - `fillTemplate("uv run ruff format {file}", "file", "C:/My Repo/a.py")` gives
    `uv run ruff format "C:/My Repo/a.py"`.
  - `replacePlaceholder("uv run pytest -q {exclude}", "exclude", "")` gives
    `uv run pytest -q`.
  - `replacePlaceholder("pytest {exclude}", "exclude", "--ignore=\"a b.py\"")` gives
    `pytest --ignore="a b.py"`.
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin command running, timeouts and tails`.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run `npm test` on Windows.** Expect PASS. Note in the execution log that Linux
  coverage comes from CI. Commit: `feat(hooks): run commands with a tree-killing timeout`.

### Task 5: Git facts and the fingerprint

**Files:** create `hooks/lib/git.mjs`; test `tests/git.test.mjs` (builds temp repos with a
local `user.name` and `user.email`).

**Interfaces (produces):**
- `headInfo(projectDir: string)` returns `{sha: string, subject: string, files: string[]} | null`.
  It is `null` when the folder is not a repo or has no commits. `files` are the paths changed by
  `HEAD`, from `git diff-tree --no-commit-id --name-only -r --root HEAD`.
- `changedPaths(projectDir: string): string[]`: every changed or untracked path, from
  `git status --porcelain=v1 -z --untracked-files=all`; for renames, the new path.
- `isTestCommit(head: {subject: string, files: string[]}, testGlobs: string[]): boolean`. True
  when the subject matches `/^test(\([^)]*\))?!?:/`, `files` is non-empty, and every file
  matches a test glob.
- `computeFingerprint(projectDir: string, watch: string[]): string | null`.
  - It returns `null` when the folder is not a repo.
  - It is a sha256 over two things: `git ls-tree -r HEAD -- <pathspecs>` (empty when there is
    no HEAD), and, for each watched changed path, the path plus `git hash-object` of the file
    (or `deleted`).
  - Pathspecs are `:(glob)` + the pattern. A pattern with no inner `/` gets a `**/` prefix, and
    a leading `/` is removed.
  - Git runs through `execFileSync` with no shell.

- [x] **Step 1: Write the tests.**
  - A non-repo folder gives `null` from both `headInfo` and `computeFingerprint`.
  - A fresh `git init` with no commits gives a `null` `headInfo` and a string fingerprint.
  - `isTestCommit` cases:

    | Subject | Files | Expect |
    |---|---|---|
    | `test(metrics): pin recall` | `["tests/test_m.py"]` | true |
    | `test!: x` | `["tests/t.py"]` | true |
    | `feat: x` | `["tests/t.py"]` | false |
    | `test: x` | `["src/a.py", "tests/t.py"]` | false |
    | `test: x` | `[]` | false |

    All with globs `["tests/**"]`.
  - With `watch: ["*.py"]`:
    - editing `README.md` leaves the fingerprint unchanged;
    - editing `a.py` changes it;
    - adding an untracked `b.py` changes it;
    - restoring `a.py` to its committed content returns the original fingerprint.
  - A repo in a folder whose name contains a space works.
  - `headInfo` after committing `tests/t.py` with subject `test: t` returns that subject and
    `["tests/t.py"]`.
  - After `git checkout --detach`, `headInfo` still returns the same commit.
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin git facts and the fingerprint`.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run `npm test`.** Expect PASS. Commit: `feat(hooks): read git facts and fingerprint watched files`.

### Task 6: Per-project state

**Files:** create `hooks/lib/state.mjs`; test `tests/state.test.mjs`.

**Interfaces (produces):**
- `State = {lastPassing: string | null, block: {fingerprint: string | null, count: number}}`
- `dataDir(): string`: `process.env.CLAUDE_PLUGIN_DATA`, or `os.tmpdir()/dev-playbook`.
- `stateFile(dir: string, projectDir: string, platform = process.platform): string`: returns
  `state-<first 16 hex of sha1(normalised projectDir)>.json`. Normalising means forward
  slashes and no trailing slash, lowercased on `win32`.
- `readState(file: string): State`: the default state when the file is missing or corrupt.
- `writeState(file: string, state: State): void`: writes `${file}.${process.pid}.tmp`, then
  renames it.

- [x] **Step 1: Write the tests.**
  - A missing file gives the default state.
  - The content `{not json` gives the default state.
  - A written state reads back deep-equal.
  - `stateFile(d, "C:\\Dev\\Repo", "win32") === stateFile(d, "c:/dev/repo/", "win32")`.
  - The same pair differs for `"linux"`.
  - No `.tmp` file is left behind after a write.
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin the per-project state file`.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run `npm test`.** Expect PASS. Commit: `feat(hooks): keep per-project state atomically`.

### Task 7: The stop check

**Files:** create `hooks/lib/io.mjs`, `hooks/lib/stop.mjs`, `hooks/stop-check.mjs`; test
`tests/stop.test.mjs` (unit, with fake dependencies) and `tests/stop-check.int.test.mjs` (the
real script on a temp repo).

**Interfaces:**
- **Consumes:** `loadConfig` (Task 3), `runCommand`, `tail`, `fillTemplate` (Task 4),
  `headInfo`, `changedPaths`, `isTestCommit`, `computeFingerprint` (Task 5), `readState`,
  `writeState`, `stateFile`, `dataDir` (Task 6), `compileGlob` (Task 2), `messages` (Task 3).
- **Produces:**
  - `readHookInput(): Promise<object>` (stdin JSON; `{}` when empty).
  - `projectDirFrom(input): string`: `$CLAUDE_PROJECT_DIR`, else `input.cwd`.
  - `runStopCheck(input: {projectDir: string}, deps?: Partial<StopDeps>): Promise<{stdout: string}>`.
    `StopDeps` holds the consumed functions; tests replace any of them.

**Decision order** (the design's §5.4 item 1, pinned here):
1. Config `absent`: `""`. Config `invalid`: `{"systemMessage": invalid(error)}`.
2. A `null` fingerprint gives `systemMessage: couldNotCheck("not a git repository")`.
3. `state.lastPassing === fp` gives `""`, without running anything.
4. `state.block.fingerprint === fp` and `count >= 3` give `systemMessage: giveUp()`, without
   running anything.
5. Run `static` (if set), then `test` (if set). They share one deadline of `timeoutSeconds`.
   For this normal run, `{exclude}` is replaced with an empty string
   (`replacePlaceholder(test, "exclude", "")`).
6. A `timeout` or `error` gives `systemMessage: couldNotCheck("<label> <status>")`. State is
   unchanged.
7. Everything passes: write `lastPassing = fp`, reset `block`, return `""`.
8. **`test` failed while `static` passed or is absent.** Red by design applies when all of
   these hold:
   - `headInfo` is a test commit (`isTestCommit` with `testGlobs`);
   - every `changedPaths` entry matches `testGlobs`;
   - `exclude` is set;
   - re-running `test` passes. For that run, each HEAD file goes through
     `fillTemplate(exclude, "file", file)`, the results are joined with spaces, and the joined
     string replaces `{exclude}` through `replacePlaceholder`.

   Then write `lastPassing = fp` and return `systemMessage: redByDesign(sha.slice(0, 7))`.
9. **Otherwise:**
   - the block count becomes `count + 1` if the fingerprint is the same, otherwise 1;
   - write the state;
   - return `{"decision": "block", "reason": block(label, command, tail(output, 60))}`.
- Any thrown error in the entry script gives `systemMessage: internalError("stop-check", message)`.
- The exit code is always 0.

- [x] **Step 1: Write the unit tests**, one per branch:
  - `absent config is silent`
  - `invalid config warns`
  - `not a git repository warns` (the fake `computeFingerprint` returns `null`, giving
    `couldNotCheck("not a git repository")`)
  - `unchanged fingerprint skips without running` (assert the fake `runCommand` was never called)
  - `passing checks record the fingerprint and stay silent`
  - `failing static blocks with its tail` (the output holds 100 lines; assert the reason ends
    with line 100 and does not contain line 40)
  - `failing test blocks and counts` (state count 1)
  - `fourth stop on the same fingerprint gives up` (state count 3 gives `giveUp()`, and
    `runCommand` is not called)
  - `a new fingerprint resets the count` (state `{fingerprint: "old", count: 3}` and a failing
    test give count 1 and a block)
  - `timeout warns and does not block`
  - `red by design allows the stop with a note`:
    - HEAD `{sha: "abc1234def", subject: "test: new", files: ["tests/test_new.py"]}`;
    - `changedPaths` returns `[]`;
    - `exclude` is `--ignore={file}`;
    - the second `runCommand` receives a command containing `--ignore="tests/test_new.py"`;
    - the output is `redByDesign("abc1234")`.
  - `red by design is not applied with code changes pending` (`changedPaths` returns
    `["src/a.py"]`, giving a block)
  - `red by design is not applied when static fails`
- [x] **Step 2: Write the integration test.**
  - Set up a temp git repo with one commit and the config:
    `{"test": "node -e \"process.exit(require('fs').existsSync('ok')?0:1)\"", "watch": ["**/*"]}`.
  - Run `node hooks/stop-check.mjs` with env `CLAUDE_PROJECT_DIR=<repo>`,
    `CLAUDE_PLUGIN_DATA=<temp>` and stdin `{"hook_event_name":"Stop","stop_hook_active":false}`.
  - Expect a stdout JSON with `decision` `block`, and exit code 0.
  - Create the untracked file `ok` and run again. Expect empty stdout.
- [x] **Step 3: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin the stop check's decisions`.
- [x] **Step 4: Implement** `io.mjs`, `stop.mjs` and the entry script.
- [x] **Step 5: Run `npm test`.** Expect PASS. Commit: `feat(hooks): block a finished turn while checks fail`.

### Task 8: Protected paths

**Files:** create `hooks/lib/deny-rules.mjs`, `hooks/lib/shell-writes.mjs`,
`hooks/protect-paths.mjs`; test `tests/deny-rules.test.mjs`, `tests/shell-writes.test.mjs`,
`tests/protect-paths.int.test.mjs`.

**Interfaces:**
- **Consumes:** `compileGlob`, `toProjectRelative` (Task 2), `loadConfig`, `messages` (Task 3),
  `readHookInput`, `projectDirFrom` (Task 7).
- **Produces:**
  - `loadProtectedRules(projectDir: string): Array<{rule: string, match: (rel: string) => boolean}>`.
    - It reads `permissions.deny` from `.claude/settings.json` and
      `.claude/settings.local.json`, keeping entries of the form `Edit(<pattern>)`.
    - Patterns starting `//` or `~/` are skipped. `/x`, `./x` and `x` are anchored at the
      project root (documented in the README as an approximation of Claude Code's
      cwd-relative rule).
    - A missing or unparsable file contributes nothing.
  - `findProtectedWrite(command: string, rules, projectDir: string): {path: string, rule: string} | null`.
    Split the command into segments on `;`, `&&`, `||` and `|`. Then tokenise each segment,
    removing quotes and normalising backslashes. A write is any of:
    - a redirection target (`>`, `>>`, `>|`, `2>`, `&>`);
    - the arguments of `tee` or `Tee-Object`;
    - any argument of `rm`, `rmdir`, `unlink`, `truncate`, `touch`, `Remove-Item`, `ri`,
      `del`, `erase`, `Clear-Content`, `New-Item`, `ni`, `Set-Content`, `sc`, `Add-Content`,
      `ac`, `Out-File`;
    - the `-Path` or first argument of those PowerShell verbs;
    - for `mv`, `move`, `Move-Item` and `mi`: both source and destination;
    - for `cp`, `copy`, `Copy-Item` and `cpi`: the last argument only;
    - `sed` or `perl` with `-i`;
    - `git` `checkout`, `restore`, `rm`, `mv` or `clean` with a protected argument;
    - inline code (`python -c`, `python3 -c`, `node -e`, possibly after `uv run`) whose code
      mentions a protected path and any of `open(`, `write`, `unlink`, `rmtree`, `writeFile`,
      `rmSync`.

    Each candidate token passes through `toProjectRelative` (relative tokens resolve against
    `projectDir`) and then the rules.
- The entry script runs on `Bash` and `PowerShell` tool calls:
  - with no config, or no finding: empty stdout;
  - with a finding:
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":protectedPath(path, rule)}}`;
  - a thrown error gives `systemMessage: internalError("protect-paths", message)` and allows
    the command.

- [x] **Step 1: Write the `deny-rules` tests.**
  - Both settings files are merged.
  - `Bash(rm *)` and `Read(./.env)` are ignored.
  - `Edit(/results/**)` matches `results/a.json`.
  - `Edit(//abs/x)` is skipped.
  - Missing files give `[]`.
  - An unparsable `settings.local.json` still lets `settings.json`'s rules load.
- [x] **Step 2: Write the `shell-writes` table tests.** The rules are `Edit(/results/**)` and
  `Edit(/data/test.lock)`.
  - Project `/repo` must give a finding for:
    - `echo x > results/a.json`
    - `echo x >> results/a.json`
    - `cat n.json | tee results/a.json`
    - `rm -rf results`
    - `rm results/a.json`
    - `mv tmp.json results/a.json`
    - `mv results/a.json /tmp/x`
    - `cp tmp.json results/a.json`
    - `sed -i 's/1/2/' results/a.json`
    - `git checkout -- results/a.json`
    - `git restore data/test.lock`
    - `Set-Content -Path results\a.json -Value x`
    - `Remove-Item results -Recurse`
    - `"x" | Out-File results/a.json`
    - `python -c "open('results/a.json','w').write('x')"`
    - `uv run python -c "import os; os.unlink('data/test.lock')"`
  - Project `C:\dev\My Repo` must give a finding for `echo x > "C:\dev\My Repo\results\a.json"`.
  - These must give `null`:
    - `cat results/a.json`
    - `git diff results/a.json`
    - `cp results/a.json /tmp/copy.json`
    - `grep -r x results`
    - `uv run python -m evals.run --out results/run-1.json`
    - `echo x > results.md`
    - `ls data/test.lock`
- [x] **Step 3: Write the integration test.** The entry script with stdin
  `{"tool_name":"Bash","tool_input":{"command":"echo x > results/a.json"}}` on a temp repo that
  has the config and a deny rule returns `permissionDecision` `deny`. `cat results/a.json`
  returns empty stdout. With no config, empty stdout.
- [x] **Step 4: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin protected-path detection for shell commands`.
- [x] **Step 5: Implement.**
- [x] **Step 6: Run `npm test`.** Expect PASS. Commit: `feat(hooks): refuse shell writes to protected paths`.

### Task 9: Session notice, formatter and registration

**Files:** create `hooks/session-start.mjs`, `hooks/format-file.mjs`, `hooks/hooks.json`;
modify `README.md` (the config file section); test `tests/session-start.int.test.mjs`,
`tests/format-file.int.test.mjs`, `tests/hooks-json.test.mjs`.

**Interfaces:**
- **Consumes:** `loadConfig`, `messages`, `runCommand`, `fillTemplate`, `compileGlob`,
  `toProjectRelative`, `readHookInput`, `projectDirFrom`.
- **Session start:** an absent config prints `absent()` as plain text; an invalid config prints
  `invalid(error)`; a valid config prints nothing.
- **Formatter:**
  - It handles `Edit` and `Write` with `tool_input.file_path`.
  - When `format` is set and the project-relative path matches `formatGlobs`, it runs
    `fillTemplate(format, "file", absolutePath)` with `timeoutMs: 60000`.
  - It is always silent and always exits 0.
- **`hooks.json`:** each handler is
  `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/hooks/<name>.mjs"],"timeout":N}`.

  | Event | Matcher | Script | Timeout (s) |
  |---|---|---|---|
  | `SessionStart` | none | `session-start` | 10 |
  | `Stop` | none | `stop-check` | 1800 |
  | `PreToolUse` | `Bash\|PowerShell` | `protect-paths` | 10 |
  | `PostToolUse` | `Edit\|Write` | `format-file` | 90 |

- [x] **Step 1: Write the tests.**
  - **Session start:** the absent, invalid and valid cases give the exact text, the exact text,
    and an empty string.
  - **Formatter:** a `format` command that writes a marker file containing its argument runs
    for `src/a.py` with `formatGlobs` `["**/*.py"]`. It does not run for `README.md`, and it
    does not run when `format` is unset.
  - **`hooks.json`:**
    - it parses;
    - it has exactly the four events, with the matchers, scripts and timeouts in the table;
    - every `args[0]` starts with `${CLAUDE_PLUGIN_ROOT}/hooks/`;
    - every referenced script file exists.
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(hooks): pin the session notice, formatter and hook registration`.
- [x] **Step 3: Implement.** Document the config keys in the README, with the Python example
  from design §5.4 and the shell rule (only `&&` and double quotes).
- [x] **Step 4: Run `npm test`.** Expect PASS. Commit: `feat(hooks): register the hooks, the session notice and the formatter`.

### Task 10: Usage report

**Files:** create `tools/usage_report.py`, `tests/tools/test_usage_report.py`,
`tests/tools/fixtures/session.jsonl`. Delete nothing: `docs/research/scripts/` stays as the
research record.

**Interfaces (produces):**
- CLI: `python tools/usage_report.py <transcripts_dir> [--since YYYY-MM-DD]` prints one block per
  session plus a total.
- `PRICES` is dated `2026-11-03`. Each entry is input, output and cache read in $ per million
  tokens:
  - `opus` 4.00 / 20.00 / 0.20
  - `sonnet` 2.00 / 10.00 / 0.10
  - `haiku` 0.10 / 0.50 / 0.01

  Matched by substring of the model id. Cache-write multipliers: 2.0 for main sessions (1-hour
  cache) and 1.25 for subagents (5-minute cache).
- `load_calls(path: Path) -> list[Call]`: deduplicates by `message.id`; skips models with no
  price and counts them in `unpriced`.
- `Call` is a dataclass: `model`, `input`, `cache_write`, `cache_read`, `output`, with the
  property `context = input + cache_write + cache_read`.
- `cost(call: Call, write_multiplier: float) -> Cost`. `Cost` has `input`, `write`, `read` and
  `output` in $, and a `total`.
- `bucket(context: int) -> str`: one of `<50k`, `50-100k`, `100-200k`, `200-400k`, `>400k`.

- [x] **Step 1: Write the tests.**
  - The fixture holds 3 assistant lines, two sharing one `message.id`. `load_calls` gives 2
    calls.
  - An Opus call with input 10, cache_write 1,000, cache_read 100,000 and output 500, costed
    with multiplier 2.0:
    - read `0.02`
    - write `0.008`
    - output `0.01`
    - input `0.00004`
    - total `0.03804` (`assertAlmostEqual`, 7 places)
  - `bucket(101_010) == "100-200k"` and `bucket(400_000) == ">400k"`.
  - A line with model `"<synthetic>"` lands in `unpriced`, not the calls.
  - The test module puts the repo root on `sys.path` before `import tools.usage_report`, so
    `discover` needs no packages.
- [x] **Step 2: Run `python -m unittest discover -s tests/tools`.** Expect FAIL. Add the step
  `python3 -m unittest discover -s tests/tools` to `.github/workflows/test.yml`. Commit:
  `test(tools): pin the usage report's arithmetic`.
- [x] **Step 3: Implement**, porting the logic from `docs/research/scripts/`.
- [x] **Step 4: Run the tests.** Expect PASS. Then run the tool on
  `C:/Users/ajlal/.claude/projects/c--dev-work-Ticket-Router-Evals`. Expect per-session
  figures close to research §1 (main-session split about 46 / 30 / 24 with 2x writes). Record
  the output in the execution log. Commit: `feat(tools): add the usage report`.

### Task 11: The dev-process skill and the conflict reviewer

Run this task on Opus 5.5 at medium effort, and load superpowers:writing-skills.

**Files:**
- Create: `skills/dev-process/SKILL.md` (under 300 lines)
- Create: `skills/dev-process/references/plan-template.md`
- Create: `agents/conflict-reviewer.md`
- Test: `tests/skills.test.mjs`

**Content.** This skill is the single home of the process. The design's §5.3 is the approved
decision record, not a copy kept in sync, so the skill states the rules and the design is
cited only as history.
- **SKILL.md** sections, in order:
  1. Match the ceremony to the task (§5.3a table).
  2. Session types (§5.3b table), with how to start each in a terminal
     (`claude --model sonnet --effort medium`) and in the VS Code extension (`/model` and
     `/effort` first).
  3. The build loop (§5.3c): `/clear` at the first task boundary past about 250k, with
     auto-compact at 400k as the safety net.
  4. Test-first: R1 and R2 with the exact trailers `Test-First: characterisation, <reason>`
     and `Test-Change: <reason>`, and what the red-by-design note means (§5.3d).
  5. Review (§5.3e).
  6. Usage habits (§5.3f), naming the tool as `python tools/usage_report.py <transcripts_dir>`.
  7. The engine table, plus the skills not used by default (§5.3g).
  8. Overrides on top of superpowers (§5.3h).
  9. Plans: point to `references/plan-template.md`.
  10. Engineering rules: "until the playbook is split (M3), follow the app-build-playbook
      skill".
- **Frontmatter:** `name: dev-process`; a `description` that triggers when planning, starting,
  sizing, executing or reviewing development work, or when asked how to work; `when_to_use`.
  Together they stay under 1,536 characters.
- **plan-template.md:** the required plan parts:
  - preconditions, verified;
  - environment facts, each with the command that checked it;
  - a decisions table (choice, alternatives, why);
  - numbered tasks, each with a test commit and a code commit, and steps that each end in a
    verification;
  - known pitfalls;
  - rollback;
  - an execution log.
- **conflict-reviewer.md:**
  - Frontmatter: `name: conflict-reviewer`; `description` (checks a draft rule document or spec
    against named files and lists the conflicts); `tools: Read, Grep, Glob`; `model: inherit`.
  - Body: the brief.
    - The caller names the draft and the files to check it against.
    - Report each conflict with `file:line` on both sides, grouped by root cause.
    - Separate clear fixes from decisions that need the owner.
    - Make no style comments.
    - Stop when the findings turn borderline.
    - Read only; never edit.

- [x] **Step 1: Write `tests/skills.test.mjs`.**
  - Every `skills/*/SKILL.md` has frontmatter whose `name` equals its folder name and whose
    `description` is non-empty.
  - `description` plus `when_to_use` is at most 1,536 characters.
  - The file is at most 300 lines.
  - `dev-process` names each of these exactly: `brainstorming`, `writing-plans`,
    `executing-plans`, `test-driven-development`, `systematic-debugging`,
    `verification-before-completion`, `requesting-code-review`, `receiving-code-review`,
    `finishing-a-development-branch`.
  - `dev-process` contains `Test-First: characterisation` and `Test-Change:`.
  - Every `agents/*.md` has `name`, `description` and `tools`.
  - `conflict-reviewer`'s `tools` is exactly `Read, Grep, Glob`.
- [x] **Step 2: Run `npm test`.** Expect FAIL. Commit: `test(skills): pin the skill and agent structure`.
- [x] **Step 3: Write the three files.** Follow superpowers:writing-skills on descriptions and
  concision.
- [x] **Step 4: Run `npm test`.** Expect PASS. Then read SKILL.md against design §5.3 a to h,
  and list in the execution log any rule the skill does not state. Commit:
  `feat(skills): add the dev-process skill and the conflict reviewer`.

### Task 12: Install, personal settings, smoke test

Configuration and verification only. There are no new tests in the repo; the evidence goes in
the execution log.

- [x] **Step 1: Read the plugin docs** on marketplaces and installation
  (code.claude.com/docs/en/plugins and the publish page), then choose how to install.
  - Default: a local marketplace. Add `.claude-plugin/marketplace.json` listing this repo
    (`"source": "./"`), run `claude plugin marketplace add C:/dev/personal/dev-playbook`, then
    `claude plugin install dev-playbook@dev-playbook`.
  - If the docs show a better way for a plugin developed in place, use it and record why.
  - Commit any manifest change: `chore: add the local marketplace manifest`.
- [x] **Step 2: Run `claude plugin validate C:/dev/personal/dev-playbook`.** Expect no errors.
  Then run `claude plugin details dev-playbook` and expect always-on cost under about 1,000
  tokens. Record both outputs.
- [x] **Step 3: Update the personal settings.**
  - Copy `~/.claude/settings.json` to `~/.claude/settings.json.bak-2026-11-24`.
  - Set top-level `effortLevel` to `"medium"`,
    `modelSettings["claude-opus-5-5"].effortLevel` to `"medium"`, and `autoCompactWindow` to
    `400000`. Keep `model: "opus"`.
  - Verify by reading the file back.
- [x] **Step 4: Smoke test** in a scratch repo at `C:/dev/personal/dev-playbook-smoke`:
  - `git init`, with one commit.
  - A failing check:
    `.claude/dev-playbook.json` = `{"test":"node -e \"process.exit(require('fs').existsSync('ok')?0:1)\"","watch":["**/*"]}`
  - `.claude/settings.json` with `{"permissions":{"deny":["Edit(/results/**)"]}}`.
  - **Run A:** `claude -p "Reply with the single word ready." --model sonnet --effort low --max-turns 3`.
    Expect the plugin's state file in its data folder to record a block for this repo. That is
    evidence the Stop hook fired. Record the transcript's hook lines if shown.
  - **Run B:** create `ok`, then repeat run A. Expect `lastPassing` set in the state file.
  - **Run C:**
    `claude -p "Run this exact shell command and nothing else: echo x > results/a.json" --model sonnet --effort low --allowedTools Bash --max-turns 3`.
    Expect `results/a.json` not to exist, and the output to mention `is protected`.
  - These three runs are the only plan usage this task spends.
- [x] **Step 5: Check exec-form substitution.** If the runs show the hooks did not fire, check
  that `${CLAUDE_PLUGIN_ROOT}` was substituted in exec form. If not, switch `hooks.json` to
  shell form (`node "${CLAUDE_PLUGIN_ROOT}/hooks/<name>.mjs"`), update the `hooks.json` test
  first (test commit), then fix and repeat Step 4.
- [x] **Step 6: Delete the scratch repo.** Update README "Install" with the chosen method.
  Commit: `docs: record how the plugin is installed`.

### Task 13: Review, publish, merge

- [x] **Step 1: Run `npm test` and the Python tests.** Expect everything to pass. Record the
  counts.
- [x] **Step 2: Review.** A fresh review session on Opus 5.5 at high effort runs
  superpowers' whole-branch review of `main..m1/plugin-core` against the design (§5.3, §5.4,
  §5.7) and this plan: correctness only, skip style. Apply fixes as test-then-code commits.
- [ ] **Step 3: Ask Ajlal before publishing.** Then:
  - `gh repo create ReyHaider/dev-playbook --public --source . --remote origin` (public since
    2026-11-24, see D1);
  - push `main` and `m1/plugin-core`;
  - open a pull request with the sections Why / What changes / How it was checked.

  Check `gh auth status` first: the active account must be `ReyHaider`.
- [ ] **Step 4: After CI passes and Ajlal approves, merge with a merge commit.** Update the
  design's status line and `docs/OPEN-WORK.md`.

---

## Known pitfalls

- **Shell commands on Windows:** with `shell: true`, Node runs `cmd.exe` on Windows. Config
  commands must avoid bash-only syntax. Killing `cmd.exe` alone leaves `uv` and `python`
  running, hence `taskkill /T /F`.
- **Hook command form:** exec form needs a real executable. `node.exe` is one, but whether
  `${CLAUDE_PLUGIN_ROOT}` is substituted inside `args` must be confirmed (Task 12, Step 5).
- **Duplicate hooks:** plugin hooks and settings hooks are not namespaced. Never register the
  same hook in both, or it runs twice.
- **Smoke runs cost usage:** `claude -p` draws from the Pro plan. Keep it to the three
  Sonnet-at-low runs.
- **CI minutes:** the repo is public (D1, changed 2026-11-24), so Actions minutes are free and CI
  runs on Linux and Windows, each with a 5-minute timeout.
- **The wrong identity:** confirm the author before the first commit. The work identity is
  only applied under `C:/dev/work/`.
- **Bash `cd`:** the shell heuristic does not follow `cd`, so `cd sub && rm ../results/x` is
  not caught. That is a documented limit; CI in each repo is the backstop.

## Rollback

- `claude plugin uninstall dev-playbook` and `claude plugin marketplace remove dev-playbook`.
- Restore `~/.claude/settings.json` from `settings.json.bak-2026-11-24`.
- The repo itself is unaffected; delete the scratch repo if it remains.

## Later milestones

Each gets its own plan, written when it starts.

| Milestone | When | Plan lives in |
|---|---|---|
| M2: Ticket Router Evals adoption (design §5.5): committed deny rules and config, CI checks including the R1 and R2 script, pre-commit, CLAUDE.md "How we work", the ruleset when admin arrives | right after M1, before phase 3 commits (D10) | that repo, `docs/engineering/plans/`, written for outside readers |
| M3: the playbook split (§5.2) and retiring app-build-playbook | after the phase 3 pilot | this repo |
| M4: the front-end layer (§5.8): ui-design, the vendored skills, design-reviewer, audit and browser-check templates | before Ticket Router Evals' site phase | this repo, then the project's own plan |
| M5: starter repos (approach C) | if still wanted | this repo |

## Execution log

| Date | Task | Evidence (command and result) | Notes |
|---|---|---|---|
| 2026-11-24 | 1 | `git config user.name` → `ReyHaider`, personal address; `npm test` red (no manifest), then 1 pass; `git ls-files --eol` → `i/lf w/lf` for all 15 files | Manifest `author` is an object, as Claude Code's schema takes. |
| 2026-11-24 | 2 | `npm test` red (modules missing), then 35 pass | Extra cases: `./` anchor, `a/**/b`, `?`, trailing `/`, Git Bash `/c/` paths, `../` escapes. |
| 2026-11-24 | 3 | `npm test` red, then 60 pass; a byte-order-mark test and fix after (61 pass) | PowerShell 5.1 writes UTF-8 with a BOM. |
| 2026-11-24 | 4 | `npm test` red, then 79 pass on Windows | Linux coverage comes from CI. The tree-kill and timeout tests failed when `killTree` was replaced by `child.kill()`. |
| 2026-11-24 | 5 | `npm test` red, then 93 pass | `git ls-tree` rejects `:(glob)` pathspecs ("pathspec magic not supported"), so the tree is listed in full and filtered with `compileGlob`. |
| 2026-11-24 | 6 | `npm test` red, then 101 pass | |
| 2026-11-24 | 7 | `npm test` red, then 125 pass | |
| 2026-11-24 | 8 | `npm test` red, then 188 pass | `open(` counts as a write only with a write mode, so reads through `python -c` stay allowed. |
| 2026-11-24 | 9 | `npm test` red, then 202 pass | |
| 2026-11-24 | 10 | `python -m unittest discover -s tests/tools` red (no module), then 9 pass. Report on the Ticket Router Evals transcripts: 6 sessions; the long session 0fcdab53 splits 47 / 28 / 24 with 88% of its usage above 200k (research §1: 46 / 30 / 24, 87%); all sessions 44 / 30 / 26 | The CI step went into the feat commit, so the test commit holds only test files (D3). |
| 2026-11-24 | 11 | `npm test` red (no `skills/`), then 220 pass; SKILL.md 148 lines, description plus `when_to_use` 404 characters | Read against design §5.3 a to h: the R1/R2 job's mechanics (pull requests only, full history) are left to M2's script. |
| 2026-11-24 | 12 | `claude plugin validate` → passed with warnings (root CLAUDE.md, no LICENSE or icon: directory-submission checks only); `claude plugin details dev-playbook` → always-on ~222 tokens; `claude plugin list` → read from `C:\dev\personal\dev-playbook`, enabled. Settings read back: effort medium (top level and Opus 5.5), `autoCompactWindow` 400000, model `opus`. Smoke A → state block count 1; B → `lastPassing` set, reply "ready"; C → "A pre-tool hook blocked it … protect `results/a.json` with an `Edit(/results/**)` rule", no `results/` | Local marketplace: loads in place, no reinstall after edits. Exec form with `${CLAUDE_PLUGIN_ROOT}` in `args` works, so Step 5 was not needed. Run C allowed `Bash` and `PowerShell`. Scratch repo deleted. |
| 2026-11-24 | 13 | `npm test` → 220 pass; Python → 9 pass. Fresh review (Opus, high effort) found 3 Important and 8 Minor. Fixed test-first: writes behind shell keywords and brackets; deleting or restoring a folder or the root that holds a protected path; a red-by-design pass surviving a later commit; a lingering child hanging the check; a missing command blocking; Git Bash escaped spaces; very long output lines. After the fixes: `npm test` → 279 pass, Python → 9 pass | Deferred minors: `Copy-Item -Destination` before `-Path`; `uv run --with`; `shutil.copy`; `stdout.write` read as a write; paths resolved against the project, not the shell's cwd; the config is not in the fingerprint. |
