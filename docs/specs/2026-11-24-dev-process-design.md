# Design: dev-playbook

**Date:** 2026-11-24 · **Status:** approved 2026-11-24, decisions D1 to D18 (D4 with the
context change); D1 changed to a public repo, D19 added and D12 confirmed the same day. M1 shipped
2026-11-24 ([#1](https://github.com/ReyHaider/dev-playbook/pull/1)). First plan: [M1, plugin core](../plans/2026-11-24-m1-plugin-core.md) ·
**Evidence:**
[research record](../research/2026-11-24-process-research.md) (every number in this design
lives there)

## 1. Why

Ajlal builds production apps with Claude Code on a Pro plan: Python now (Ticket Router Evals),
and Next.js, Astro, Cloudflare Workers, Neon and Expo before and after. He wants two things that
pull against each other:

- work that is strictly test-driven and production-grade, with checks and balances, and
- a lot of verified work per 5-hour usage window.

Today the process lives in three places, and none of them enforces it:

- **superpowers** (a third-party plugin) runs the work: brainstorming, plans, the test loop,
  debugging, review. It has had 7 major versions in a year, and its defaults are written for
  unlimited plans.
- **app-build-playbook** (a personal skill) holds engineering rules learnt shipping a client's
  production app. It mixes general rules with notes for one stack, and it is not in git.
- **each repo's CLAUDE.md** adds project rules and overrides superpowers where they conflict.

Every rule is written, none is enforced: nothing stops a session ending with failing checks or
editing a file that must never be hand-edited. Measured usage (research §1) shows the spend is
driven by model, effort and very long sessions, not by superpowers itself.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Checks a machine enforces, during the session and in CI, so quality does not depend on the
   agent remembering a rule.
2. Test-first that is real (provable after the fact) and affordable on Pro.
3. More verified work per window: the right model and effort per session, short sessions, no
   review loops.
4. One home for the process across every project; superpowers becomes a replaceable engine.
5. Works with Windows development and Linux CI, at $0 a month beyond the Pro plan.

**Non-goals**
- A framework for other people. It is personal first; teammates can be invited later.
- Replacing superpowers now.
- Model review inside CI (it draws from the same Pro plan).
- Sandboxing (not available on native Windows).

**Anti-goals: failure even if it technically works**
- Ceremony heavier than the work it guards.
- Checks so noisy they get ignored, or that pass when there is nothing to check.
- Approvals that check nothing ("human-in-the-loop theater").
- A public project repo whose guarantees depend on this plugin.
- Repo text that says an AI wrote it.

## 3. Constraints

- Pro plan: a 5-hour and a weekly limit, shared with claude.ai, numbers unpublished. `/usage` and
  the status line are the gauges.
- Claude Code 2.1.322 or later. Windows 11 with Git Bash and PowerShell 5.1; Linux CI.
- The decision tiers (sticky, shaped, trivial) and "one home for each fact" from the playbook.
- No AI attribution in commits, pull requests or repo documents.
- The plugin repo is public under the MIT licence, on the personal GitHub account `ReyHaider`, cloned at
  `C:/dev/personal/dev-playbook` (that folder's git config gives the personal identity).

## 4. Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| A. Copies in each repo: a playbook section, plus hook scripts and CI copied from the last project | cheapest now; copies drift, fixes never reach other projects, the playbook stays unversioned | rejected |
| **B. A personal plugin plus a little config in each repo** | one home; new projects start with the checks on; costs building and testing the plugin | **chosen** |
| C. A starter repo per stack | strong on day one; no way to update existing projects | later add-on to B |
| Two modes, one on superpowers and one without | two copies of the process, which drift | rejected: superpowers sits behind one table instead (§5.3g) |
| Replace superpowers with Spec Kit, BMAD, OpenSpec or Kiro | heavier, with no outcome evidence (research §4) | rejected |

## 5. Design

### 5.1 Four layers, one repo

```
dev-playbook/                       public repo, ReyHaider/dev-playbook
├─ .claude-plugin/plugin.json
├─ skills/
│  ├─ dev-process/                  layer 3: how work runs (§5.3)
│  ├─ engineering-rules/            layer 1: rules for any stack
│  ├─ ui-design/                    layer 1: interface rules, DESIGN.md and theme templates (§5.8)
│  ├─ stack-python/                 layer 2: stack packs, loaded only when relevant
│  ├─ stack-web-cloudflare/
│  ├─ stack-expo/
│  ├─ web-design-guidelines/        vendored, pinned (§5.8d)
│  ├─ react-best-practices/         vendored, trimmed (§5.8d)
│  ├─ react-composition/            vendored (§5.8d)
│  ├─ llm-features/
│  └─ client-work/
├─ agents/conflict-reviewer.md      read-only; checks a draft against named files
├─ agents/design-reviewer.md        read-only plus the browser; reviews UI branches (§5.8e)
├─ THIRD_PARTY_NOTICES.md           source, commit and licence of every vendored file
├─ hooks/hooks.json + scripts       layer 4: enforcement (§5.4)
├─ tools/usage-report.py            the measurement scripts from research §1
├─ tests/                           tests for the hook scripts and tools
└─ docs/                            this design, the research record, the plans
```

Layer 4 also has a part that lives in each repo (§5.4), because a repo's guarantees must not
depend on a plugin outside it.

### 5.2 Layers 1 and 2: splitting the playbook

| Playbook section | Goes to |
|---|---|
| §1 How to work (without the plan format) | engineering-rules |
| §1 "Plan in a runbook" (the plan's required parts) | dev-process, the single home of plan format |
| §2 Records, §3 Robustness, §4 Environments and releases, §5 Testing and debugging, §8 Third-party services, §10 Windows and Git, §12 Day-one checklist | engineering-rules |
| §6 Design and UI | ui-design (§5.8) |
| §11 Next.js, Tailwind, AI SDK, Workers, Stream, Neon, tsx | stack-web-cloudflare |
| §11 Expo | stack-expo |
| §7 LLM features | llm-features |
| §9 Clients | client-work |
| (new) Python, uv, Ruff, mypy, pytest on Windows | stack-python, generalised from Ticket Router Evals' LESSONS |

- Content moves verbatim; any rewording is a separate, reviewed commit.
- A check proves nothing was lost: every line of the old playbook is either found in a new skill
  or listed as cut, with the reason.
- Each skill's description says when it loads, so a Python project never loads Expo or CSS notes.
- The toolchain defaults from research §8 go into the stack packs, with the date they were checked.
- The old `~/.claude/skills/app-build-playbook` is retired only after the split is verified, and
  references to it (Ticket Router Evals' CLAUDE.md) are updated in the same change.

### 5.3 Layer 3: the dev-process skill

**(a) Match the ceremony to the task.**

| Size | Example | Steps |
|---|---|---|
| Trivial | a bug with a clear reproduction, under about 20 lines | a test commit that reproduces it, a fix commit, checks |
| Small | fits in one build session | plan mode or a short plan in chat; tests then code per task; `/code-review` at the end |
| Feature or phase | several sessions | a think session (design, then plan), build sessions, a review session, a pull request |
| Rule documents | policies, guides, rubrics | cases first, then rules, then one narrow fresh reviewer per document (engineering-rules) |

**(b) Session types.** Each starts fresh. The model and effort are chosen when the session
starts and not switched during it (a switch rebuilds the cache; research §2).

| Session | Model, effort | Does | Ends with |
|---|---|---|---|
| Think | Opus 5.5, high | design, plan (each task's tests described), boundary cases, rule documents | a committed document |
| Build | Sonnet 5.5, medium; Opus 5.5, medium for tasks that need judgment | 2 to 4 plan tasks in the build loop | a clean commit, then `/clear` |
| Review | Opus 5.5, high | one review of the whole branch against the spec and plan; correctness only | a list of findings; fixes go to a build session |
| Debug | Opus 5.5, high | a failure a build session could not fix in two tries | a failing test that reproduces it, then the fix |

**(c) The build loop.** Read only the plan task and the files it names. For each task: write the
task's tests, run them, commit them alone; write the code; run the checks; commit. `/clear` at
the first task boundary after the context passes about 250k (Ajlal's choice: build sessions may
run between 250k and 400k). Auto-compact at 400k is the safety net. The plan's checkboxes and
the git log carry the state; a task is never left half done across a `/clear`.

**(d) The test-first form.** Strict red-green per line costs 3 to 8.5x the tokens, and agents
fake the failing step (research §4); agents also game tests they can edit (research §5). So:

- A task's tests are written from the plan's description of the behaviour, before the code, and
  committed alone as `test(<scope>): ...`. The code follows in later commits. A task is now two
  or more commits, not one. Normally a task's test commit and code commits land in the same turn.
- Two rules, checked by a script in CI on every pull request (my call on the mechanics, after
  the builder check):
  - **R1, test commits fail first.** A commit whose subject has the type `test` must touch only
    test files (the stack's test globs; `tests/**` for Python). The test files it adds or changes
    are run at that commit, in a separate worktree, and must fail (a collection or import error
    counts as failing). They must pass at the head of the pull request. A test commit whose
    tests already pass, because they pin existing behaviour, needs the trailer
    `Test-First: characterisation, <reason>`.
  - **R2, every other test change is explained.** Any other commit that touches a test file
    needs the trailer `Test-Change: <reason>`. Review reads those changes first.
  - Merge commits are skipped. The job runs only on `pull_request`, with the full history
    checked out. Ordinary CI checks the branch head, so a red test commit in the middle of a
    pushed branch is expected and fine.
  - The script and its tests live in each repo that uses them, because a repo's CI must not
    depend on this plugin. Ticket Router Evals holds the first copy (§5.5);
    stack-python links to it as the reference.
- **Proof that the tests bite:** mutation testing on the core modules, weekly and on demand,
  report-only until a baseline exists, then a floor (D7).
- Inside a session, Claude does not have to show red for each assertion: the red check proves
  it once per commit, mechanically.

**(e) Review.**
- No reviewer subagent per task.
- One fresh review per branch, at the end, against the spec and plan: superpowers' final
  whole-branch review when installed, otherwise `/code-review high` in a fresh session. The
  brief always says "correctness only, skip style".
- Rule documents: one narrow fresh reviewer per document at draft time, through the
  `conflict-reviewer` agent (read-only, given the named files, lists the conflicts).
- The person reviews intent. The pull request's "How it was checked" lists the commands run and
  what they showed; changes carrying `Test-Change` are read first.
- No model review in CI on Pro. `/code-review ultra` only by deliberate choice (paid after 3 free
  runs).

**(f) Usage habits.**
- Set the model and effort at the start: `claude --model sonnet --effort medium` in a terminal,
  or `/model` and `/effort` as the first commands in the VS Code extension.
- Near 85% of the 5-hour window (status line or `/usage`), finish the current task and commit;
  do not start another.
- Subagents only to keep bulk reading out of the main context, on Sonnet or Haiku, with a word
  cap on the report.
- After each phase, run `tools/usage-report.py` and compare with the previous phase.
- Avoid: agent teams, `/loop` polling, fast mode, hooks that call a model.

**(g) The engine table.** The process is written once; this table names the tool for each step.

| Step | With superpowers | Without |
|---|---|---|
| Clarify and design | brainstorming | plan mode, "interview me, then write the spec" |
| Plan | writing-plans, plus the required parts below | plan mode, plan saved to a file |
| Build | executing-plans, inline ("Native") | the build loop (c) |
| Test-first | test-driven-development, in the form (d) | the form (d) |
| Debug | systematic-debugging | reproduce with a failing test; one hypothesis and one change at a time |
| Before claiming done | verification-before-completion | the stop check (§5.4) and `/verify` |
| Review | requesting-code-review, receiving-code-review | `/code-review`, conflict-reviewer |
| Finish a branch | finishing-a-development-branch | the pull request checklist |

Not used by default: subagent-driven-development (only for a plan with many independent tasks,
with a cheaper implementer model), dispatching-parallel-agents, using-git-worktrees.

**(h) Overrides on top of superpowers.**
- Sticky decisions stop the work even mid-plan; "rulings, not stalls" covers shaped and trivial
  decisions only.
- The test-first form (d) replaces red-green per line.
- Every plan also has: preconditions (verified), environment facts with the command that checked
  them, a decisions table, steps that each end in a verification, known pitfalls, rollback, and
  an execution log.
- Commits and pull requests carry no AI attribution.

### 5.4 Layer 4: enforcement

**In the plugin: generic hooks.** They do nothing in a repo that has no
`.claude/dev-playbook.json`. The repo is `$CLAUDE_PROJECT_DIR`, which stays fixed even when
Claude works in a subfolder.

1. **Stop check** (Stop event).
   - If nothing has changed since the last passing run, do nothing. The fingerprint covers
     `HEAD`, the working tree's changes, and untracked files under the watched globs. It is kept
     in the plugin's data folder.
   - Otherwise run the repo's `static` command (format, lint, types), then its `test` command,
     each with its timeout.
     - Pass: remember the fingerprint and print nothing (no context cost).
     - Fail: block, giving the command and the last 60 lines of its output as the reason.
   - **Red by design** (my call, after the builder check): if `HEAD` is a test commit (R1) and
     nothing is changed outside test files, the `test` command runs with that commit's test files
     excluded, through the config's `{exclude}` placeholder. If that passes, the turn may end
     with one line: "tests from <commit> are red by design, awaiting code". This keeps the stop
     check from fighting the test-first form.
   - After 3 blocks in a row on the same fingerprint, let the turn end and show the person
     "checks still failing: this is not done", so a stuck loop does not burn the window.
   - A timeout, or a check that cannot start, lets the turn end with a visible "could not check"
     warning, never a silent pass.
2. **Protected paths** (PreToolUse on Bash and PowerShell).
   - The list has one home: the repo's `permissions.deny` `Edit(...)` rules in
     `.claude/settings.json` (committed) and `.claude/settings.local.json`. Claude Code already
     enforces them for its own editing tools.
   - The hook extends those rules to shell commands. It matches the rules' gitignore-style
     patterns (a leading `/` is the project root; `**` spans folders), with paths normalised to
     forward slashes and made relative to the project. A command that names a protected path
     together with a write (redirection, `rm`, `mv`, `cp`, `sed -i`, `tee`, `Set-Content`,
     `Out-File`, `git checkout` or `git restore` of that path) is refused, with the reason.
   - This is a heuristic, documented as one: a script file that writes the path is not caught.
     CI is the backstop.
3. **Formatter** (PostToolUse on Edit and Write, optional): runs the repo's format command on
   the edited file, silently, so the stop check rarely fails on formatting alone.
4. **Session notice** (SessionStart): in a repo without the config file, one line, "dev-playbook:
   no config here, checks are off". Nothing otherwise.

The repo's config file holds only the repo's own facts, for example:

```json
{
  "static": "uv run ruff format --check . && uv run ruff check . && uv run mypy",
  "test": "uv run pytest -q {exclude}",
  "exclude": "--ignore={file}",
  "testGlobs": ["tests/**"],
  "timeoutSeconds": 600,
  "watch": ["**/*.py", "pyproject.toml", "uv.lock"],
  "format": "uv run ruff format {file}",
  "formatGlobs": ["**/*.py"]
}
```

**In each repo** (works without the plugin). In Ticket Router Evals this is written by hand
(§5.5); stack-python is then extracted from it.
- committed `permissions.deny` rules for the files that must never be hand-edited
- a pre-commit configuration for fast local feedback
- the CI checks: format, lint, types, tests with random order and branch coverage, coverage of
  changed lines, the red check and test-change trailer, dependency audit, workflow security,
  secret scan, code scanning, and weekly mutation testing
- a ruleset on `main`: pull requests required, checks required, no force-push, merge commits only

**Personal settings** (D4): top-level `effortLevel: medium` and
`modelSettings.claude-opus-5-5.effortLevel: medium` (raise at launch for think, review and debug
sessions); `autoCompactWindow: 400000`, as a safety net under `/clear`.

### 5.5 Adoption in Ticket Router Evals

Each item is sticky there and goes into that repo's own plan, written for outside readers (it
is public). It may link to this plugin as the maintainer's tooling, but nothing in it depends on
the plugin.

1. Committed `.claude/settings.json`: deny `Edit(/results/**)`, `Edit(/data/test.lock)`, and
   the test set file once frozen. The harness still writes results, through `uv run`.
2. `.claude/dev-playbook.json` with the check command, and `typeCheckingMode = "basic"` under
   `[tool.pyright]` in `pyproject.toml`, so the Pyright plugin's diagnostics do not compete with
   mypy (D19).
3. CI: pytest-randomly; branch coverage with diff-cover on changed lines; Hypothesis tests for
   the JSONL loader and the metrics; pip-audit; zizmor; CodeQL default setup; the R1 and R2
   checks (a script in the repo, with its own tests on fixture git histories); weekly mutmut;
   the secret scanner per D9.
   - The coverage floor's home is `fail_under` in `pyproject.toml`. It is raised by hand in a
     commit when coverage rises; CI prints a notice when the real figure is a point or more above
     the floor.
   - The mutmut module list lives in `pyproject.toml` too. Its first values (metrics and scoring)
     are approved with that repo's plan.
4. A pre-commit configuration (Ruff and the fast tests).
5. The ruleset on `main` once repo admin access arrives (already requested).
6. CLAUDE.md "How we work": session types, the test-first form and its CI check, a test commit
   plus code commits per task, superpowers as an engine with the overrides, and rule 4 reworded
   to "a fresh session per 2 to 4 tasks".
7. Later, once results exist (phase 4 onward): CI recomputes every published metric from the
   committed raw outputs and fails on any mismatch. That is the structural guard for "nothing
   is typed in by hand".

### 5.6 Rollout

1. Plugin core: the repo, the dev-process skill, the hooks with their tests, conflict-reviewer,
   the usage report. Installed locally and tried on a scratch repo.
2. Personal settings changed.
3. Ticket Router Evals adoption pull request, on a branch from `main`, before phase 3 commits
   anything (D10).
4. Phase 3 runs under the new process as the pilot; its usage and catches are measured.
5. The playbook split into layers 1 and 2; app-build-playbook retired.
6. The front-end layer (§5.8), before the first UI work that uses it. In Ticket Router Evals
   that is the site phase. Whether a client project adopts it is a separate decision for that
   project.
7. Starter repos (approach C), if still wanted.

### 5.7 How we will know it works

- **Hook tests** on fixture repos, on Windows (Git Bash) and Linux:
  - a failing check blocks;
  - a passing check is silent;
  - an unchanged tree skips the run;
  - 3 blocks are followed by a visible warning;
  - no config means only the one-line notice;
  - shell writes to protected paths are refused, and reads are allowed.
- **Plugin checks:** `claude plugin validate` is clean, and `claude plugin details` shows under
  about 1,000 always-on tokens.
- **R1 and R2 tests** on fixture git histories, in Ticket Router Evals:
  - a test commit that fails and then passes is accepted;
  - a test commit that already passes without the trailer is rejected;
  - a test commit that touches non-test files is rejected;
  - a non-test commit that touches a test file without `Test-Change` is rejected.
- **Stop check and test-first together:** a turn ending on a fresh test commit is allowed with
  the "red by design" line; the same failure with a code change pending is blocked.
- **Pilot:** phase 3's usage per completed task against phase 2's (usage report); how often the
  stop check blocked; anything a check caught goes into LESSONS.
- **Split:** every line of the old playbook is accounted for.

### 5.8 Front-end: design system, skills and browser checks

**Why.** Research §9: the same developer's production app had an excellent written design
system and drifted from it within weeks (about 480 arbitrary text sizes against a scale of 6 to
7, 23 shadows against 2 to 3), because only colours were tokens and nothing checked the code.
Design skills improve taste a little (weak evidence) and do nothing about drift; checks do.

**(a) Tokens in code are the one source.**
- Every scale is a token: colours, type sizes with line heights, radii, shadows, extra spacing,
  z-index, motion durations. Tailwind's default namespaces for those scales are reset (for
  example `--text-*: initial`), so an off-scale built-in class does not exist.
- Web only: Tailwind `@theme` is the source. Web plus Expo: DTCG token files are the source, and
  Style Dictionary generates both the `@theme` CSS and the Expo theme module. CI regenerates the
  outputs and fails on any difference.
- `docs/design/DESIGN.md` follows Google's design.md structure. Its prose is written by hand:
  overview, per-screen templates (customer and admin), components, do's and don'ts,
  accessibility, content, decisions, definition of done. Its token front matter is generated
  from the source, never typed, so the pinned `designmd lint` can check contrast and references.
- Each front-end project's CLAUDE.md has a short UI section: link to DESIGN.md; build from
  `components/ui`; no arbitrary values; no raw interactive elements outside `components/ui`.

**(b) Checks that fail the build.**
- A design audit script (first copy in the first front-end project, then in the stack pack)
  counts:
  - arbitrary values (`text-[`, `rounded-[`, `shadow-[`, hex colours in classes or styles,
    numeric `fontSize` in React Native);
  - `transition-all`;
  - raw interactive elements (`<button>`, clickable `<div>`) outside `components/ui`.

  A committed budget file holds today's counts. CI fails when any count rises, and counts only
  ever fall.
- ESLint with jsx-a11y and the typed promise rules (`no-floating-promises`,
  `no-misused-promises`).
- `designmd lint`, pinned at 0.4.0, and the token regenerate-and-diff check.

**(c) Browser checks, written as tests that print numbers.** A Playwright suite, pinned with the
project, visits every route in every state at 320, 360, 390, 768, 1024 and 1280 px. It asserts:
- no horizontal overflow, measured with every `<details>` open and `aria-hidden` decoration
  skipped;
- no serious or critical axe violations (WCAG 2 A and AA);
- interactive targets of at least 44 px on customer screens;
- no console errors;
- every image has a width and height.

How it runs:
- **Data:** it runs on seeded or mocked data, so CI needs no database. Each route's states come
  from fixtures.
- **In a build session:** the agent runs it for the routes it touched and reads the text output.
  It looks at two or three viewport screenshots only when it changed layout or visuals
  (about 250 to 1,300 tokens each; research §9).
- **CI also runs:**
  - `toHaveScreenshot` on a few stable pages at 2 or 3 widths, with Linux baselines refreshed by
    a manual workflow;
  - Lighthouse CI budgets on the key pages.
- **Agent tooling:** `npx playwright` from the project's pinned version. No browser MCP server by
  default. Claude in Chrome stays off by default. The official `playwright` plugin is not used
  as published, because it runs an unpinned version in a visible browser.

**(d) Skills.**

| Skill | Source | How it is used |
|---|---|---|
| ui-design | ours: playbook §6 plus DESIGN.md and theme templates | in the plugin |
| web-design-guidelines | Vercel, pinned snapshot | vendored with attribution, plus an overrides file where house style differs (sentence case, not Title Case) |
| react-best-practices | Vercel | vendored and trimmed: the critical and high rules, the re-render rules rewritten for the React Compiler, Cloudflare caveats added, the JavaScript micro-optimisations dropped |
| react-composition | Vercel composition-patterns | vendored |
| frontend-design | Anthropic, official marketplace | installed and enabled only in front-end projects; for new surfaces and brand-led pages, never for restyling an existing system |
| expo | Expo, official marketplace | installed in Expo projects; its UI skills used, its EAS skills ignored |
| shadcn | shadcn | only in projects that use shadcn |

- **Skipped:** ui-ux-pro-max (its UX rules are read for ideas during the split, not installed),
  Impeccable, web-artifacts-builder, theme-factory, and the Figma and Storybook MCPs unless a
  project uses those tools.
- **Vendored copies** are pinned to a commit, with source, licence and date in their SKILL.md and
  in THIRD_PARTY_NOTICES.md. They are refreshed deliberately, never automatically. Vercel's repo
  has no LICENSE file, so its MIT licence is confirmed before anything is copied.

**(e) The design-reviewer agent.** Adapted from OneRedOak's design review (MIT).
- Tools: Read, Grep, Glob and the Playwright CLI. No Edit or Write.
- It runs the browser-check suite first and works from its numbers.
- It then looks at no more than six viewport screenshots, for what numbers cannot judge:
  hierarchy, alignment, consistency with DESIGN.md.
- It checks the changed files against web-design-guidelines.
- Every finding is graded Blocker, High, Medium or Nit, and carries its evidence: a measurement,
  or a screenshot plus the element.
- It is used in the review session of any branch that changes UI.

**(f) Definition of done for a screen.**
1. Built from tokens and `components/ui`.
2. The design audit budget is not exceeded.
3. The browser checks pass at all six widths, in every state.
4. web-design-guidelines is clean on the changed files.
5. The design-reviewer's High and Blocker findings are resolved.
6. The person walks the flow once in a real browser, and on a phone for the keyboard and safe
   areas.

**(g) Expo.**
- Tokens are generated from the shared source.
- The audit has React Native equivalents: numeric `fontSize`, and raw `Pressable` outside `ui`.
- Maestro flows run locally. EAS Workflows only after confirming they stay within the free plan.
- Accessibility props are checked in review.

## 6. Decisions for approval (sticky)

D1 to D18 were approved on 2026-11-24. The same day D1 was changed from a private to a public
repo, and D19 was added.

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Name and home | plugin `dev-playbook`; public repo `ReyHaider/dev-playbook` under the MIT licence (changed from private on 2026-11-24); local `C:/dev/personal/dev-playbook` |
| D2 | Hook runtime | Node, standard library only: present for every stack he builds. Python is missing on JS-only machines; bash is missing on PowerShell-only machines |
| D3 | Test-first form | as §5.3d: test commit first, red check in CI, the two trailers, two or more commits per task |
| D4 | Models, effort, context | as §5.3b; effort medium by default on every model; default model stays Opus, build sessions start on Sonnet; build sessions `/clear` at a task boundary past about 250k, `autoCompactWindow` 400k; revisit after the pilot |
| D5 | Review | as §5.3e: no per-task reviewers, one fresh review per branch, no model review in CI |
| D6 | Coverage | branch coverage on; changed lines 100% covered unless excluded with a reason comment; the global floor starts at today's figure and only rises |
| D7 | Mutation testing | weekly and on demand, Linux CI, core modules only; report-only until a baseline exists, then a floor |
| D8 | New Python dependencies for Ticket Router Evals | pytest-randomly, Hypothesis, coverage.py with diff-cover, pip-audit, zizmor, pre-commit, mutmut; CodeQL default setup |
| D9 | Secret scanner | trufflehog (very active) replaces gitleaks (no release since March) outright, pinned by checksum the way the gitleaks job is today; plus GitHub push protection when admin allows |
| D10 | Order | rollout as §5.6: plugin core and the repo's adoption before phase 3 commits, the playbook split after the pilot. The adoption branch is cut from `main`; phase 3's untracked drafts stay untracked and are never staged (files are staged by explicit path) |
| D11 | Superpowers | default and non-default skills as §5.3g, overrides as §5.3h |
| D12 | The playbook in a public personal repo | before M3 moves it in: confirm it holds nothing confidential about Toolshed's client, and that publishing it is acceptable to Toolshed. Confirmed 2026-11-24 |
| D13 | Front-end skills | as §5.8d: our ui-design; vendor web-design-guidelines, a trimmed react-best-practices and composition-patterns; install Anthropic's frontend-design and Expo's skills per project; skip ui-ux-pro-max and Impeccable |
| D14 | Tokens and DESIGN.md | as §5.8a: every scale a token with Tailwind defaults reset; `@theme` as the source for web only, DTCG files plus Style Dictionary for web plus Expo; DESIGN.md front matter generated; `@google/design.md` pinned at 0.4.0 |
| D15 | Design checks in CI | as §5.8b: the audit script with a budget that only falls; jsx-a11y and typed promise rules; design lint and regenerate-and-diff |
| D16 | Browser checks | as §5.8c: the Playwright suite at six widths on fixture data, with visual regression on a few pages and Lighthouse budgets; the Playwright CLI pinned per project, no browser MCP by default |
| D17 | Design reviewer | as §5.8e |
| D18 | Definition of done and Expo | as §5.8f and §5.8g |
| D19 | Code intelligence | the official `pyright-lsp` and `typescript-lsp` plugins at user scope, their language servers installed globally at pinned versions (README); other languages' official LSP plugins when a project first uses them; Pyright in basic mode where mypy is the gate; measured in the phase 3 pilot |

## 7. Left to the builder

- The wording, descriptions and triggers of each skill, and file names inside the plugin.
- The hook scripts' internals: fingerprinting, output trimming, Windows path handling.
- How the plugin is installed: `~/.claude/skills/` (`claude plugin init`) or a
  marketplace, after reading `plugins/publish.md`.
- The plugin repo's own CI, kept fast. It runs on Linux and Windows, since public repos have free
  Actions minutes.
- Exact CI job layout and versions in Ticket Router Evals, within the decisions above.

## 8. Calls made after the builder check

A fresh reviewer read this design as a builder (2026-11-24). Its questions were settled as
follows; each is marked "my call" where it appears.

- **The stop check and test-first conflicted:** a turn ending on a fresh test commit would be
  blocked. Added the "red by design" rule, which needs split `static` and `test` commands and an
  `{exclude}` placeholder (§5.4).
- **The red check's mechanics** are now rules R1 and R2 (§5.3d). R2 is stricter than the first
  draft: any non-test commit touching a test file needs `Test-Change`, not only edits to files
  a test commit introduced. It runs on pull requests only, so a red commit mid-branch is fine.
- **Where the red-check script lives:** in each repo, Ticket Router Evals first, because a
  repo's CI must not depend on the plugin (§5.3d).
- **How the hooks find things:** `$CLAUDE_PROJECT_DIR` for the repo; deny rules from the
  project's settings files; gitignore-style matching (§5.4).
- **Homes for the coverage floor and the mutmut module list:** `pyproject.toml` (§5.5).
- **The stack pack comes after the adoption:** Ticket Router Evals' setup is written by hand
  first and the pack is extracted from it (§5.4, §5.6).
- **gitleaks is replaced, not run alongside trufflehog** (D9). **Phase 3's untracked drafts**
  stay untracked during the adoption branch (D10).
