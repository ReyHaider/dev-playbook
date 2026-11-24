# Open work

As of 2026-11-24. Items leave this list when they ship. Each milestone gets its own plan when it
starts.

| Milestone | When | Plan lives in |
|---|---|---|
| M2: Ticket Router Evals adoption (design §5.5): committed deny rules and config, CI checks including the R1 and R2 script, pre-commit, Pyright basic mode (D19), CLAUDE.md "How we work", the ruleset when admin arrives | right after M1, before phase 3 commits (D10) | that repo, `docs/engineering/plans/`, written for outside readers |
| M3: the playbook split (§5.2) and retiring app-build-playbook | after the phase 3 pilot | this repo |
| M4: the front-end layer (§5.8): ui-design, the vendored skills, design-reviewer, audit and browser-check templates | before Ticket Router Evals' site phase | this repo, then the project's own plan |
| M5: starter repos (approach C) | if still wanted | this repo |

## Deferred from M1's review

Minor findings from the final review of M1, not yet fixed:

- The protected-path hook misses `Copy-Item -Destination` given before `-Path`,
  `uv run --with X python -c ...`, and `shutil.copy` in inline Python.
- `sys.stdout.write` in inline Python makes a read of a protected path look like a write, so it
  is refused.
- Relative paths in shell commands resolve against the project folder, not the hook input's
  `cwd`, so they are wrong after a `cd` into a subfolder.
- The stop check's fingerprint does not cover `.claude/dev-playbook.json`, so a config change
  after a pass waits for a watched file to change.
- `tools/usage_report.py` prints each session's first and last times without applying
  `--since`.
