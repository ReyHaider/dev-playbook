# dev-playbook

Ajlal's development process as a Claude Code plugin: session rules, test-first checks, and hooks
that enforce them.

It holds:

- the `dev-process` skill: how work is sized, planned, built, tested and reviewed;
- the `conflict-reviewer` agent: checks a draft rule document or spec against named files;
- hooks: a stop check that blocks a finished turn while checks fail, protected paths for shell
  commands, an optional formatter, and a session notice;
- `tools/usage_report.py`: usage per session from Claude Code transcripts.

## Install

The repo is its own local marketplace (`.claude-plugin/marketplace.json`). A marketplace added
from a local path loads its plugin in place, so edits here take effect at the next session (or
after `/reload-plugins`), with no reinstall and no version bump.

```
claude plugin marketplace add C:/dev/personal/dev-playbook
claude plugin install dev-playbook@dev-playbook
```

Check it with `claude plugin validate C:/dev/personal/dev-playbook` and
`claude plugin details dev-playbook`; the always-on cost is about 220 tokens. The stop check's
state lives in `~/.claude/plugins/data/dev-playbook-dev-playbook/`.

Remove it with `claude plugin uninstall dev-playbook@dev-playbook` and
`claude plugin marketplace remove dev-playbook`.

### Code intelligence

The `dev-process` skill expects the official language-server plugins for Python and
TypeScript/JavaScript. They cost no always-on context; each needs its language server on the
`PATH`, pinned here:

```
npm install -g pyright@1.1.414 typescript-language-server@6.1.0 typescript@7.0.2
claude plugin install pyright-lsp@claude-plugins-official
claude plugin install typescript-lsp@claude-plugins-official
```

For another language, install its official `*-lsp` plugin (and its language server) when a
project first uses it.

## The config file

The hooks do nothing in a project without `.claude/dev-playbook.json`, apart from a one-line
notice when a session starts. The file holds only the project's own facts. A Python project:

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

| Key | Required | Meaning |
|---|---|---|
| `static` | one of `static` and `test` | Format check, lint and types. Runs first. |
| `test` | one of `static` and `test` | The tests. `{exclude}` is replaced with nothing on a normal run. |
| `exclude` | when `test` uses `{exclude}` | One exclusion argument; must contain `{file}`. Used only for "red by design" (below). |
| `testGlobs` | no, default `["tests/**"]` | Which files are tests. |
| `watch` | yes | The files whose changes make the checks run again. |
| `timeoutSeconds` | no, default 600 | One deadline shared by `static` and `test`; a whole number from 1 to 1500. |
| `format` | no | Run on each file Claude edits or writes; must contain `{file}`. |
| `formatGlobs` | when `format` is set | Which edited files are formatted. |

Any other key makes the file invalid, and an invalid file turns the checks off with a visible
reason.

**Commands run through the platform shell:** `cmd.exe` on Windows, `/bin/sh` on Linux. So that
one command works on both, use only `&&` between commands and only double quotes. Placeholders
(`{file}`) are filled with double-quoted paths.

**Globs** are gitignore-style: a leading `/` anchors a pattern at the project root, a pattern with
no other `/` matches at any depth, `*` stays within a folder and `**` spans folders. On Windows,
matching ignores case.

### What the hooks do

- **Stop check.** When a turn ends and a watched file has changed since the last passing run, it
  runs `static`, then `test`. A failure blocks the turn with the command and the last 60 lines of
  its output. After 3 blocks on the same change it lets the turn end with "This is not done". A
  timeout, or a command that cannot start, lets the turn end with a "could not check" warning.
- **Red by design.** When `HEAD` is a test commit (subject type `test`, only test files) and
  nothing outside the tests has changed, `test` runs again with that commit's test files
  excluded through `exclude`. If that passes, the turn ends with "tests from <commit> are red by
  design, awaiting code".
- **Protected paths.** The project's `permissions.deny` rules of the form `Edit(<pattern>)`, in
  `.claude/settings.json` and `.claude/settings.local.json`, are extended to Bash and PowerShell
  commands: a redirection into, or an `rm`, `mv`, `cp`, `sed -i`, `tee`, `Set-Content`,
  `Out-File`, `git checkout` or `git restore` of, a protected path is refused. So is deleting,
  moving or restoring a folder (or the whole project) that holds one, and `git clean`. This is a
  heuristic: it does not follow `cd`, wildcards, `git reset` or `git stash`, and a script that
  writes the path is not caught, so CI is the backstop. Unlike Claude Code, which reads `Edit(x)` relative to the current folder, the hook
  anchors `x`, `./x` and `/x` all at the project root; `//x` and `~/x` rules are skipped.
- **Formatter.** After Claude edits or writes a file matching `formatGlobs`, `format` runs on it,
  silently.

## Licence

MIT. See [LICENSE](LICENSE).
