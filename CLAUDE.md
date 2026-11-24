# dev-playbook

A personal Claude Code plugin that holds Ajlal's development process: the `dev-process` skill,
the `conflict-reviewer` agent, hooks that enforce the checks (stop check, protected paths,
formatter, session notice) and a usage report.

- Design: [docs/specs/2026-11-24-dev-process-design.md](docs/specs/2026-11-24-dev-process-design.md)
- Plans, one per milestone: [docs/plans/](docs/plans/)
- Still to do: [docs/OPEN-WORK.md](docs/OPEN-WORK.md)

## Commands

All run from the repo root.

| Command | Does |
|---|---|
| `npm test` | Runs the hook and skill tests (`node --test`) |
| `python -m unittest discover -s tests/tools` | Runs the usage report's tests |

## Rules

- **Node 24 or later, standard library only.** No npm dependencies. Hooks are `.mjs` entry
  scripts over pure modules in `hooks/lib/`, each taking its inputs explicitly so it can be
  tested without Claude Code. `tools/` is Python 3.14, standard library only.
- **Windows 11 and Linux.** Paths may contain spaces and backslashes. CI runs on Linux and
  Windows.
- **A hook never breaks a turn.** Every hook exits 0; an internal error becomes a visible
  `systemMessage` starting with `dev-playbook:`.
- **User-facing messages live only in `hooks/lib/messages.mjs`.** Tests pin their exact text.
- **Commits follow Conventional Commits in the test-first form:** each task is a
  `test(<scope>): ...` commit holding only test files, then `feat(...)` or `fix(...)` commits.
  The full form, with its trailers, lives in the `dev-process` skill.
- **Stage files by explicit path.**
- **No AI attribution** in commits, authors, pull requests or repo text.
- **Never push, create the GitHub repo or open a pull request without asking Ajlal first.**
- **`main` is protected by a ruleset, with no bypass.** Changes reach it only through a pull
  request, merged with a merge commit (squash and rebase are off). Both CI checks,
  `test (ubuntu-latest, python3)` and `test (windows-latest, python)`, must pass. `main` cannot be
  force-pushed or deleted. Renaming the CI job or its matrix means updating the ruleset's required
  checks in the same change, or every merge blocks.
- Text files are LF in the repo and the working copy (`.gitattributes`).
