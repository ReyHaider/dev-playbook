---
name: dev-process
description: Use when planning, sizing, starting, executing or reviewing development work in any project, choosing a session's model and effort, writing a plan, committing tests, or when asked how we work or which superpowers skill runs a step.
when_to_use: Also when a session's context passes about 250k tokens, when the stop check blocks or reports red by design, before claiming work is done, and before opening a pull request.
---

# Dev process

How Ajlal's projects are built with Claude Code on a Pro plan: strictly test-first, checked by
machines, and frugal with usage. This skill is the single home of the process. Superpowers is an
engine that runs some of its steps (section 7); where a superpowers skill disagrees with this
one, this one wins. A repo's CLAUDE.md wins over both.

## 1. Match the ceremony to the task

| Size | Example | Steps |
|---|---|---|
| Trivial | a bug with a clear reproduction, under about 20 lines | a test commit that reproduces it, a fix commit, checks |
| Small | fits in one build session | plan mode or a short plan in chat; tests then code per task; `/code-review` at the end |
| Feature or phase | several sessions | a think session (design, then plan), build sessions, a review session, a pull request |
| Rule documents | policies, guides, rubrics | cases first, then rules, then one narrow fresh reviewer per document (`conflict-reviewer`, section 5) |

## 2. Session types

Each session starts fresh. Choose the model and effort when it starts and do not switch during
it: a switch rebuilds the cache.

| Session | Model, effort | Does | Ends with |
|---|---|---|---|
| Think | Opus 5.5, high | design, plan (each task's tests described), boundary cases, rule documents | a committed document |
| Build | Sonnet 5.5, medium; Opus 5.5, medium for tasks that need judgment | 2 to 4 plan tasks in the build loop | a clean commit, then `/clear` |
| Review | Opus 5.5, high | one review of the whole branch against the spec and plan; correctness only | a list of findings; fixes go to a build session |
| Debug | Opus 5.5, high | a failure a build session could not fix in two tries | a failing test that reproduces it, then the fix |

Starting one:
- **Terminal:** `claude --model sonnet --effort medium` for a build session;
  `claude --model opus --effort high` for think, review and debug.
- **VS Code extension:** run `/model` and `/effort` as the first two commands, before any prompt.

The personal default is effort medium on every model, with Opus as the default model. Raise the
effort at launch for think, review and debug sessions.

## 3. The build loop

- Read only the plan task and the files it names.
- For each task: write the task's tests, run them, commit them alone; write the code; run the
  checks; commit.
- `/clear` at the first task boundary after the context passes about 250k tokens. Auto-compact at
  400k is only the safety net.
- The plan's checkboxes and the git log carry the state. Never leave a task half done across a
  `/clear`.

## 4. Test-first

Strict red-green for every assertion costs 3 to 8.5 times the tokens, and agents fake the failing
step; agents also game tests they can edit. So the proof is made once per commit, by a machine:

- A task's tests are written from the plan's description of the behaviour, before the code, and
  committed alone as `test(<scope>): ...`. The code follows in later commits (`feat`, `fix`).
  A task is two or more commits; normally its test commit and code commits land in the same turn.
- **R1, test commits fail first.** A commit of type `test` touches only test files (the stack's
  test globs; `tests/**` for Python). The tests it adds or changes are run at that commit, in a
  separate worktree, and must fail; a collection or import error counts as failing. They must pass
  at the head of the pull request. A test commit whose tests already pass, because they pin
  existing behaviour, carries the trailer `Test-First: characterisation, <reason>`.
- **R2, every other test change is explained.** Any other commit that touches a test file carries
  the trailer `Test-Change: <reason>`. Review reads those changes first.
- Each repo's CI checks R1 and R2 on every pull request, with a script that lives in that repo.
  Merge commits are skipped. A red test commit in the middle of a pushed branch is expected.
- Inside a session there is no need to show red for each assertion: the red check proves it once
  per commit.
- Mutation testing on the core modules, weekly and on demand, proves the tests bite. It reports
  only until a baseline exists, then holds a floor.

**The stop check.** In a repo with `.claude/dev-playbook.json`, the plugin's Stop hook runs the
repo's checks when a turn ends and something watched has changed:
- A block that quotes a failing command and its last lines: fix it before finishing.
- "tests from <commit> are red by design, awaiting code": `HEAD` is a fresh test commit, nothing
  outside the tests has changed, and everything else passes. This is the expected state between a
  task's test commit and its code commit, not a failure.
- "This is not done" (after 3 blocks on one change) or "could not check": the change is
  unverified. Say so plainly; never report it as done.
- "checks are off": the repo has no valid config, so nothing was checked.

## 5. Review

- No reviewer subagent per task.
- One fresh review per branch, at the end, against the spec and plan: superpowers' final
  whole-branch review when installed, otherwise `/code-review high` in a fresh session. The brief
  always says "correctness only, skip style".
- Rule documents: one narrow fresh reviewer per document at draft time, through the
  `conflict-reviewer` agent, given the draft and the files to check it against.
- The person reviews intent. The pull request's "How it was checked" lists the commands run and
  what they showed; changes carrying `Test-Change` are read first.
- No model review in CI on Pro. `/code-review ultra` only by deliberate choice (paid after 3 free
  runs).

## 6. Usage habits

- Set the model and effort at the start (section 2).
- Near 85% of the 5-hour window (status line or `/usage`), finish the current task and commit; do
  not start another.
- Use subagents only to keep bulk reading out of the main context, on Sonnet or Haiku, with a word
  cap on the report.
- After each phase, measure it with `python tools/usage_report.py <transcripts_dir>`, run from the
  dev-playbook repo. `<transcripts_dir>` is the project's folder under `~/.claude/projects/`;
  `--since YYYY-MM-DD` limits the report to the phase. Compare with the previous phase.
- Avoid agent teams, `/loop` polling, fast mode, and hooks that call a model.

## 7. The engine

The process is written once; this table names the tool for each step.

| Step | With superpowers | Without |
|---|---|---|
| Clarify and design | brainstorming | plan mode, "interview me, then write the spec" |
| Plan | writing-plans, plus the required parts (section 9) | plan mode, plan saved to a file |
| Build | executing-plans, inline ("Native") | the build loop (section 3) |
| Test-first | test-driven-development, in the form of section 4 | the form of section 4 |
| Debug | systematic-debugging | reproduce with a failing test; one hypothesis and one change at a time |
| Before claiming done | verification-before-completion | the stop check (section 4) and `/verify` |
| Review | requesting-code-review, receiving-code-review | `/code-review`, `conflict-reviewer` |
| Finish a branch | finishing-a-development-branch | a pull request with Why, What changes, and How it was checked |

Not used by default: subagent-driven-development (only for a plan with many independent tasks,
with a cheaper implementer model), dispatching-parallel-agents, using-git-worktrees.

## 8. Overrides on top of superpowers

- Sticky decisions stop the work, even in the middle of an approved plan: dependencies and version
  pins, schemas and public contracts, model choices, anything public-facing or destructive, and
  whatever the repo's CLAUDE.md adds. Give options with a recommendation and wait. "Rulings, not
  stalls" covers shaped and trivial decisions only.
- The test-first form of section 4 replaces red-green per line.
- Every plan has the parts in section 9.
- Commits, pull requests and repo documents carry no AI attribution: no `Co-Authored-By` trailer,
  no "Generated with" line, no text saying an AI wrote something.

## 9. Plans

A plan has the parts in [references/plan-template.md](references/plan-template.md). Write one plan
per phase or milestone, just before it starts, not weeks ahead.

## 10. Engineering rules

Until the playbook is split (M3), follow the app-build-playbook skill for the engineering rules:
decision tiers, records, robustness, environments and releases, testing and debugging, UI, LLM
features, third-party services, and Windows and Git.
