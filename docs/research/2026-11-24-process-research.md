# Research: a development process for Claude Code on a Pro plan

As of 2026-11-24. This is the evidence behind
[the design](../specs/2026-11-24-dev-process-design.md), kept so the design can be checked and
redone. Numbers live here; the design links to them.

**How it was gathered.** Eight research passes on 2026-11-24 (three broad, then five deeper ones,
each told to date every source), plus measurements on the development machine. Tags:

- **[docs]** official Claude Code docs, fetched live that day
- **[full]** page fetched and read, through a fetch tool that summarises, so figures may be paraphrased
- **[snip]** search-result text only: a lead, not a fact
- **[local]** measured on the machine

---

## 1. Where the usage goes [local]

Transcripts of the Ticket Router Evals sessions, 2026-11-17 to 2026-11-23. Tokens are weighted
by API list price as a proxy, since Anthropic does not publish how Pro weights them. Opus 5.5:
$4 input, $20 output, $0.20 cache read; cache writes cost 1.25x input (5-minute cache) or 2x
(1-hour cache, used for the main conversation on a subscription). Sonnet 5.5 is half of each.

| Measure | Result |
|---|---|
| Main-session usage split | re-reading the context 46%, new content written to the cache 30%, output and thinking 24% |
| Subagents | 10 to 20% of each session |
| Usage spent while the context was above 200k tokens | 87%; peak 762k; one session ran 3 days, 612 calls, 2 compactions |
| What if the context had been capped at 150k | 3 to 22% less, after paying to reload the base context on each restart |
| Context of a fresh session before any work | about 57k tokens |
| Settings found | `model: opus`; top-level `effortLevel: high` (does not apply to Opus 5.5); `modelSettings.claude-opus-5-5.effortLevel: xhigh`; Claude Code 2.1.322 |

**Reading.** The biggest levers are the model (Sonnet 5.5 costs half of Opus 5.5 at every rate)
and effort (thinking is billed as output). Context length matters, but capping it alone saves
less than expected. Subagents are a minority of the spend. The scripts are in
[scripts/](scripts/) (`usage.py`, `weigh.py`, `cap.py`; each takes the transcripts folder).

## 2. Claude Code mechanics [docs]

### Plans and usage
- Pro and Max have a 5-hour session limit and a weekly limit, shared between Claude and Claude
  Code, across all models: switching model does not restore access. No numbers are published.
  (support.claude.com/en/articles/11145838; code.claude.com/docs/en/costs)
- Pro defaults to Opus 5.5 since v2.1.280. Aliases: `sonnet` = Sonnet 5.5, `opus` = Opus 5.5,
  `haiku` = Haiku 5.5. (model-config)
- `/usage` on Pro shows plan bars and attributes usage to skills, subagents, plugins and MCP
  servers, with a recommendation once one is 10% or more. It reads local history only. The status
  line receives `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day` and
  `context_window.used_percentage` on Pro. (costs, statusline)
- What raises usage: the whole context re-read on every request; cache misses after a gap;
  `/compact` itself (it reads the whole conversation; `/clear` costs nothing); subagents and
  workflow agents (their own requests); `/loop` runs; thinking, billed as output; agent teams,
  about 7x tokens in plan mode. (costs)
- Prompt cache: 1 hour for the main conversation on a subscription, 5 minutes for subagents,
  compaction and forks. Switching model invalidates the cache; changing effort does not on the
  5.5 models. (prompt-caching)
- Fast mode is paid from usage credits, outside the plan. (fast-mode)
- `claude -p` and the Agent SDK still draw from the subscription: a split announced for
  2026-06-15 was paused (help-center article 15036540, via a summary; recheck before relying on
  it). GitHub Actions with a `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` uses the
  subscription; secrets are withheld from pull requests from forks. (github-actions)
- `/code-review` counts against plan usage. `/code-review ultra` runs in the cloud on usage
  credits: Pro gets 3 free runs, then about $5 to $25 a run. `/goal` adds a small-model check on
  every turn, billed on top. (code-review-local, ultrareview, goal)

### Context, model and effort settings
- Auto-compact defaults to about 967k on 1M-context models. Lower it with `/autocompact 500k`,
  the `autoCompactWindow` setting (minimum 100k) or `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. (model-config)
- `effortLevel` accepts low, medium, high, xhigh. A top-level value does not apply to Opus 5.5;
  per-model values live in `modelSettings`. `--effort` sets it per launch;
  `CLAUDE_CODE_EFFORT_LEVEL` overrides everything. The 5.5 models default to medium; the docs
  suggest high or xhigh for edge-case-heavy work and say max "tends to overthink". (model-config)
- `opusplan` uses Opus in plan mode and Sonnet otherwise; each switch rebuilds the cache.
- CLAUDE.md: under 200 lines, loaded on every request. Skill descriptions load on every request,
  bodies when used. `.claude/rules/*.md` with `paths:` load only when a matching file is read or
  edited. `claude plugin details <name>` prints a plugin's always-on token cost. (features-overview,
  memory, plugins/measure)
- Best practices: give Claude a check that passes or fails and ask for the command output as
  evidence; `/clear` between unrelated tasks; after two failed corrections, `/clear` and rewrite
  the prompt; tell reviewers "correctness only, skip style"; CLAUDE.md advises, hooks and CI
  enforce. (best-practices)

### Hooks [docs: hooks.md, first ~200k of 293k characters read]
- Shape: event, then matcher group, then handlers (`command`, `http`, `mcp_tool`, `prompt`,
  `agent`). Sources merge: user, project, local and managed settings; a plugin's
  `hooks/hooks.json`; skill and subagent frontmatter.
- Matchers: `Edit|Write` is an exact list; other characters make a regex; Stop and
  UserPromptSubmit ignore matchers.
- PreToolUse receives `tool_name` and `tool_input`; Stop receives `stop_hook_active` and
  `last_assistant_message`. Paths are absolute, with backslashes on Windows.
- PreToolUse refusal:
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`.
  With several hooks: deny beats defer beats ask beats allow.
- Stop: `{"decision":"block","reason":"..."}` (or exit 2 with the reason on stderr) keeps Claude
  working. After 8 blocks in a row with no tool call, the turn ends anyway
  (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it).
- Exit 0 is success, 2 blocks, anything else is non-blocking. `onFailure: "block"` (v2.1.295+)
  turns a crash or timeout into a block, but not for Stop hooks.
- Windows: shell-form commands run in Git Bash when installed, otherwise PowerShell; a hook can
  set `"shell": "powershell"`; exec form needs a real `.exe` (`node script.js` works).
- A hook adds nothing to context unless it prints; SessionStart and UserPromptSubmit output goes
  into context (capped at 10,000 characters).
- Project hooks run once the folder is trusted (and under `-p` even when not). `--bare` skips hooks.

### Permissions and sandbox [docs: permissions, sandboxing]
- Order: deny, ask, allow. A deny in any scope beats an allow in any other. Deny rules are not
  gated on trust.
- Path rules use gitignore syntax; `/x` is relative to the project root in project settings.
  `Edit(...)` also covers Write and NotebookEdit; a `Write(...)` rule never matches.
- Deny rules also catch Bash redirections (`>`, `>>`, `tee`) and recognised file commands, but
  not arbitrary subprocesses (a script that writes a file), `bash -c` or `/bin/rm`.
- The sandbox works on macOS, Linux and WSL2 only. On native Windows, commands run unsandboxed.
- Auto mode's classifier pauses after 3 blocks in a row or 20 in total, and guards `.git`,
  `.claude`, `.pre-commit-config.yaml` and similar paths.

### Subagents, skills, plugins, checkpoints [docs]
- Subagent frontmatter includes `tools`, `disallowedTools`, `model`, `effort`, `maxTurns`,
  `permissionMode`, `skills`, `isolation: worktree`, `hooks`, `omitClaudeMd`. A read-only
  reviewer is `tools: Read, Grep, Glob` (Bash can still modify files).
  `CLAUDE_CODE_SUBAGENT_MODEL` with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` forces one model.
- Skill frontmatter includes `description` and `when_to_use` (1,536 characters together),
  `disable-model-invocation`, `allowed-tools`, `paths`, `model`, `effort`, `context: fork`, `hooks`.
- `claude plugin init <name>` creates `~/.claude/skills/<name>/` with
  `.claude-plugin/plugin.json`, loaded in every session as `<name>@skills-dir`. Layout:
  `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/hooks.json`. Check with
  `claude plugin validate`; try with `claude --plugin-dir`. Plugin hooks are not namespaced, so
  the same hook in settings and a plugin runs twice. Publishing through a marketplace
  (plugins/publish) was not read.
- `/rewind` does not track changes made through Bash or by subagents; it is not a replacement
  for git.

## 3. Superpowers

- Latest is 7.0.2 (2026-11-03), the installed version. MIT licence (checked in the installed
  copy). [full: RELEASE-NOTES.md]
- Changes that affect cost: 6.3.0 (2026-08-12) batches small tasks into one dispatch; 6.4.1
  (2026-09-18) adds inline "Native" execution with one review of the whole branch, said to run
  well on a mid-tier model, and an optional mid-tier controller at about half the cost
  (maintainer figure); 6.4.2 (2026-09-25) plans record decisions, not full code, at about a
  quarter of the time and a third of the tokens; 7.0.0 (2026-10-09) brainstorming scales to the
  task; 7.0.1 (2026-10-21) skills trimmed under 20,000 characters (the design doc had been
  skipped in 24 of 24 runs, 3 of 24 after); 7.0.2 fewer filler questions (41 to 23).
- No independent cost measurement of 7.x exists.
  - Schipper, Sep to Oct 2026, on 6.3 and 6.4.1: 11 plans, 407 subagent dispatches, about 3.3B
    tokens, output 0.06%; controller 35%, subagents 65%; 4% of dispatches (over 150 turns) used
    44% of subagent tokens. [full]
    tim-schipper.nl/en/blog/superpowers-subagent-driven-development-cost
  - Laszlo, 500 tasks from SWE-bench-family suites, on Codex, before 6.0: about 40% more tokens
    and 74 s more per task; accuracy 45.6% without and 47.8% with, not significant. The original
    (Medium) returned 403; read through secondary write-ups. [snip]
  - Issue #1152 (Apr 2026, Codex): subagent-driven development used a whole 5-hour budget on a
    simple plan. Issue #750: a Pro user roughly halved usage by skipping the spec review. [snip]
- Third-party advice for lighter use: brainstorming only; skip it for edits under about 20
  lines; a fresh session per plan; inline execution. [full and snip]

## 4. Frameworks and industry signals

- Böckeler, "Understanding spec-driven development: Kiro, spec-kit, and Tessl", 2025-10-15
  (tested Sep 2025): Kiro turned a small bug into 4 user stories with 16 acceptance criteria;
  spec-kit's files were verbose; agents ignored spec notes. No follow-up found. [full]
  martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- Böckeler, "TDD inside the agent loop: theater or actual value?", 2026 (mentions Sonnet 4.6):
  22 agent solutions in 5 batches, rated blind by a model. No clear quality difference; TDD used
  about 3 to 8.5x the tokens (cache reads counted at full weight, so the dollar gap is smaller);
  agents often skipped or faked the failing step; she no longer tells agents to do TDD. She calls
  the sample "very small, directional only". [full]
  martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html
- Thoughtworks Technology Radar, Vol. 35 (Nov 2026), from one summarised fetch (verify): mutation
  testing Adopt; OpenSpec Trial; no spec-driven development entry; Caution on "agent skill
  cognitive surrender" and "human-in-the-loop theater"; Trial on anchoring coding agents to a
  reference application and on a feedback flywheel. Vol. 34 (Apr 2026) framed spec-driven
  development and agent skills as feedforward controls and mutation testing as a feedback
  control ("putting coding agents on a leash"). [full]
- Other frameworks, no controlled outcome data for any [snip]: Spec Kit 1.0 (2026-08-21);
  OpenSpec 1.4 (about 250 lines of artifacts against about 800 for Spec Kit, n=1); Kiro generally
  available Mar 2026; BMAD v6, the heaviest (one review: about 6 days and $200 against 1 to 2
  days); Agent OS 3.0 (Jan 2026) dropped its own spec and task commands in favour of Claude
  Code's plan mode; Task Master 0.43.
- Anthropic, "Effective harnesses for long-running agents", 2025-11-26 [full]: a first session
  sets up a progress file and a JSON feature list with test steps and a `passes` flag the agent
  may only flip (JSON because models overwrite it less than Markdown); one feature per session,
  ending in a commit; each session starts by reading the git log and progress file; end-to-end
  tests, because unit tests and curl missed failures.
- Anthropic, "Harness design for long-running application development", 2026-03-24 [full]: a
  solo run took 20 min and $9, a planner-generator-evaluator harness 6 h and $200. With Opus 4.6
  they dropped sprints, kept the planner and moved the evaluator to one pass at the end: "the
  evaluator is worth its cost only for tasks beyond what the model does reliably alone".
- Anthropic, Claude Code quality postmortem, 2026-04-23: quality fell from a lower default effort,
  a caching bug and a verbosity prompt (fixed in v2.1.116). [full, partial]
- Liu et al., "From plan to action", arXiv 2604.12147, 2026-04-13 [full]: 16,991 trajectories
  on SWE-bench Verified with small open models. Resolved runs followed their plans more;
  incomplete plans hurt more than no plan; re-showing the plan every 5 steps helped.

## 5. Agent code quality and test gaming

- Opus 5.5 system card, via Zvi's write-up (not the PDF): attempted reward hacking is 3 to 6x
  higher on impossible tasks, about 80% of it knowingly incomplete work; successful hacks were
  about 0.63% of training episodes; false completion claims roughly halved against earlier
  models. [full, secondary]
- Opus 4.6 system card: hacked 45% of impossible problems with no prompt and 37.5% with an
  anti-hacking prompt. [snip]
- SpecBench, arXiv 2605.21384 (May 2026): every frontier agent passes all visible tests; the gap
  on held-out tests grows about 28 points per 10x code size; one 2,900-line "compiler" memorised
  the test inputs. [abstract]
- EvilGenie, arXiv 2511.21654 (revised May 2026): explicit hacking by Codex and Claude Code,
  caught with held-out tests, model judges, test-file edit detection and human review. [snip]
- Defect profile, vendor data: CodeRabbit (2025-12-17, 470 pull requests) found 10.83 issues per
  AI pull request against 6.45: logic about 1.75x, error handling about 2x, security up to
  2.74x, readability over 3x [full]. GitClear (2026, 623M changed lines): duplication +81%,
  two-week churn +15%, error-masking code +47%, refactoring moves -70% [snip]. Veracode (Oct
  2026): 38% of generated code failed its security scan; Opus 5.5 among the best at 73% passing
  [snip].
- Package hallucination, arXiv 2605.17062: 4.6 to 6.1% of samples from five models (Oct 2025 to
  Mar 2026), down from 5.2 to 21.7% in 2024; 43% of invented names recur, which is why attackers
  register them. [snip]
- Prompt injection through repo files (CLAUDE.md, AGENTS.md, READMEs) was reported in 2026
  incidents (CSA research notes) [snip]. OWASP Top 10 for Agentic Applications 2026 (2025-12-09)
  includes goal hijack (ASI01) and supply chain (ASI04) [snip]. The OpenSSF guide for AI code
  assistant instructions (2025-08-01) puts slopsquatting first and says "act as a security
  expert" personas do not help [snip].

## 6. Which checks catch what

Ranked by evidence per unit of cost.

| Check | Cost | Evidence |
|---|---|---|
| Tests the agent cannot see or edit: held-out sets, protected files, test-edit detection | about zero | strong (SpecBench, EvilGenie, Anthropic's impossible-task evaluations) |
| Strict types, lint, and a check that new dependencies exist and are wanted | seconds of CI | moderate for dependency checks; typing unmeasured on agent defects |
| Static security analysis and secret scanning | minutes of CI | moderate (vendor data) |
| Mutation testing on core or changed code | CI minutes, weekly | moderate: an LLM-written suite with 100% line and branch coverage scored 4% (MutGen, arXiv 2506.02954); Meta's ACH had 73% of generated tests accepted; Radar Adopt |
| Property-based tests | tokens and triage | moderate: Anthropic (2026-01-14) found 56% of sampled reports valid, with patches merged in numpy and others |
| A model reviewing the diff | plan usage per run | weak to moderate: vendor benchmarks show about 50 to 70% recall; the independent Martian benchmark has the best tool at 60.8% F1 |
| Small batches, version control, a person reviewing intent | people's time | survey level (DORA 2025) |

## 7. Does process help?

- METR's 2025 trial (16 developers, 246 tasks): 19% slower with AI while feeling 20% faster. The
  Feb 2026 update (57 developers, 800+ tasks): estimated speed-ups of 18% and 4%, with intervals
  spanning zero; METR calls it very weak evidence. [full]
- DORA 2025: AI amplifies existing practices. Its AI Capabilities Model: a clear AI stance, a
  healthy data ecosystem, AI-accessible internal data, strong version control, small batches,
  user-centric focus, quality internal platforms. No 2026 DORA report confirmed. [snip]
- No 2026 controlled study of test-first, plan-first or review practices with Claude Code found.

## 8. Toolchains (versions as of 2026-11-24)

### Python

| Tool | Version, date | Note |
|---|---|---|
| uv | 0.13.9, 2026-11-17 | `uv sync --locked` in CI; `uv audit` is a preview (Jun 2026) |
| Ruff | 0.17.6, 2026-11-19 | format, lint, and `S` rules (covers bandit) |
| mypy | 2.4.1, 2026-10-28 | the strict type gate |
| ty | 0.0.109, 2026-11-23 | beta, diagnostics unstable: not a gate |
| pyrefly | 1.5.0, 2026-11-19 | marked stable; optional |
| coverage.py | 7.17.5, 2026-11-23 | branch coverage, `fail_under` |
| diff-cover | 11.0.4, 2026-11-19 | coverage of changed lines; needs full git history in CI |
| pytest-randomly | 5.1.0, 2026-11-08 | random test order, seed printed |
| Hypothesis | 6.170.17, 2026-11-20 | property-based tests |
| mutmut | 3.8.1, 2026-10-28 | needs `fork`: Linux or WSL only; no "changed since main" mode |
| pre-commit | 4.7.0, 2026-10-13 | local feedback; CI stays the gate |
| pip-audit | 2.10.1, 2026-06-10 | stable vulnerability audit |
| trufflehog | 3.100.1, 2026-11-23 | active; gitleaks 8.30.1 has not released since 2026-03-21 |
| zizmor | 1.33.1, 2026-11-22 | GitHub Actions workflow security |
| Scorecard action | 2.6.0, 2026-11-19 | optional |
| Dependabot | built in | uv version updates (Mar 2025), uv security updates (Dec 2025) |

GitHub rulesets on a free public repo can require pull requests and checks, block force-pushes
and restrict merges to merge commits ("linear history" must stay off). They need repo admin.

### TypeScript, web, Workers, Expo

| Tool | Version, date | Note |
|---|---|---|
| Biome | 2.6.8, 2026-11-15 | format and basic lint |
| ESLint, typescript-eslint | 10.15.0, 8.74.0 (Nov 2026) | typed rules such as `no-floating-promises` |
| TypeScript | 7.0.2, 2026-07-08 | Go compiler; no stable API until 7.1, so typed lint needs a TypeScript 6 install |
| Vitest | 5.1.1, 2026-11-18 | v8 coverage |
| @cloudflare/vitest-plugin | 1.9.1, 2026-11-23 | renamed from vitest-pool-workers |
| PGlite, testcontainers | 0.6.0, 12.2.2 | in-process Postgres, real Postgres |
| MSW | 3.0.7 | HTTP mocking |
| Playwright | 1.65.1, 2026-11-13 | sharding; screenshot baselines on Linux CI |
| @axe-core/playwright | 4.14.0 | accessibility |
| @lhci/cli | 0.16.1 | performance budgets |
| Maestro on EAS Workflows | | Expo end-to-end; EAS free plan: 15 Android and 15 iOS builds, 60 workflow minutes a month |
| StrykerJS | 10.1.1, 2026-10-23 | mutation testing, weekly |
| fast-check | 4.11.0, 2026-11-21 | property-based tests |
| knip | 6.48.0 | unused files, exports, dependencies |
| pnpm | 12.23.0, 2026-11-22 | `minimumReleaseAge` (1 day by default since 11; set 3 to 7 days), `blockExoticSubdeps`, `allowBuilds` |
| osv-scanner | 2.7.1, 2026-11-09 | lockfile vulnerability scan |
| squawk | 2.74.0, 2026-11-23 | Postgres migration lint |
| Renovate | 44.258.2 | `config:best-practices` includes a 3-day release age |

npm in 2025 and 2026: classic tokens revoked (Dec 2025); trusted publishing through OIDC; worm
outbreaks (Shai-Hulud variants Apr to May 2026; ChainDrop, Aug 2026, 868+ packages released with
valid provenance), so provenance alone is not enough and a release-age delay is now the main
defence.

## 9. Front-end: skills, design documents, browser checks (second pass, same day)

### A production app's design practice [local, read-only review]
A Next.js 16 / Tailwind v4 app with an Expo companion, built by the same developer:
- **Strong on paper.** A 35 KB `docs/design/DESIGN.md` in Google's design.md format, with
  colour, type, radius and spacing tokens, about 35 component entries, per-screen templates
  (member and admin), Do's and Don'ts, accessibility, a definition of done and decisions. It came
  out of a written UI audit. Colour tokens live in Tailwind `@theme`, with contrast ratios
  commented, and match the docs and the Expo theme. There are 23 shared components in
  `src/components/ui/`, reduced motion is handled globally, and there are about 100
  `focus-visible` styles and 300 `aria-` attributes.
- **Not enforced.** About 480 arbitrary text sizes across 22 distinct values (the doc defines 6
  to 7); about 55 off-spec radii; 23 distinct arbitrary shadows (the doc defines 2 to 3);
  `transition-all` in 5 files despite a "never" rule; raw `<button>` in 5 files beside the
  Button component; 10 px text about 43 times despite a 12 px floor; 44 px targets only partly
  applied.
  - Only colours are tokens: type, radius and shadow scales exist only in the document.
  - ESLint is stock, with no a11y or design rules. The DESIGN.md linter is run by hand.
  - CI runs no end-to-end tests, no width matrix, no axe and no visual regression; the
    end-to-end specs need a real database and skip without one.
  - The Expo theme is a hand copy, kept in sync by a comment.
- **Lesson:** a written design system drifts within weeks unless every scale is a token in code
  and a check fails the build on off-scale values.

### Skills [full unless marked]
- **Vercel agent-skills** (github.com/vercel-labs/agent-skills; ~35k stars; very active, latest
  release 2026-11-20; MIT per README and frontmatter, but no LICENSE file in the repo; installed
  with `npx skills add`, not a Claude Code plugin):
  - `web-design-guidelines` (v1.1.0, 2026-10-27): about 1.5k tokens. Since PR #358 it bundles a
    pinned snapshot of Vercel's Web Interface Guidelines (commit 434b7f9, SHA-256 recorded) and
    no longer fetches at run time. Output is `file:line` findings. It covers accessibility, focus,
    forms, animation, typography, content, images, performance, navigation, touch, safe areas,
    dark mode, i18n and hydration. Some rules are house style (Title Case buttons, `&`).
  - `react-best-practices`: 70 rules (async 6 and bundle 6 critical; server 10 high; client 4;
    rerender 15; rendering 11; js 14; advanced 4). The index is about 1.3k tokens; everything
    compiled is about 18k. It is Next.js and Vercel-centred; the memo rules conflict with the
    React Compiler; `server-cache-lru` assumes a long-lived process (not true on Workers).
  - Also: `composition-patterns` (8 rules, about 2.5k words), `react-native-skills` (about 40
    rules), `react-view-transitions`, and Vercel-only deploy skills.
- **Anthropic `frontend-design`** (claude-plugins-official, v1.1.1; same file in
  anthropics/skills): about 2.3k tokens, no scripts. It covers aesthetic direction: ground the
  design in the subject, deliberate type, avoid named AI-default looks, one orchestrated motion
  moment, a quality floor for contrast and focus, and UX writing. Anthropic's post (2025-11-12)
  shows only before-and-after screenshots.
- **ui-ux-pro-max** (nextlevelbuilder; ~153k stars; MIT; v2.15.0, 2026-08-13): a bundle of over
  5 MB with CSV catalogues (styles, palettes, 74 font pairings, 141 UX rules, 22 stack files) and
  Python search scripts. The scripts were audited and make no network calls; the other bundled
  skills and the CLI were not audited. SKILL.md is about 4.7k tokens and has a broad trigger.
  Its palettes and pairings are the generic kind. Automated reviews call it redundant.
- **Impeccable** (pbakaus; ~116k stars; Apache-2.0) [snip]: built on frontend-design, with 24
  commands and a detector for 62 "AI slop" patterns. It downloads a binary, installs hooks that
  run outside approval, and sends telemetry unless turned off.
- **OneRedOak design-review** (MIT, ~3.9k stars): about 22 KB of markdown. A Sonnet agent with
  Playwright works in phases (interaction, responsiveness at 1440, 768 and 375, polish,
  WCAG 2.1 AA, robustness, code health, console) and grades Blocker, High, Medium or Nit. As
  published it has Write and Edit tools, so it is not read-only.
- **Others:** shadcn's official skill (reads `components.json`) [snip]; expo/skills, official
  (`expo@claude-plugins-official`; UI skills plus EAS skills) [snip]; Callstack's React Native
  skills; Figma MCP (needs a paid seat); Storybook MCP addon. Anthropic's web-artifacts-builder,
  theme-factory and brand-guidelines do not fit app work.
- **Evidence that design skills help:** weak. Small self-run blind tests favour frontend-design
  for distinctiveness (one benchmark: 100% against 28% on 6 assertions; one arena tie at 8/10;
  a two-page test scoring 7.0 for frontend-design, 6.75 for Impeccable and 5.25 for no skill).
  Nothing measures usability or accessibility. [snip]

### Design documents and tokens
- **Google design.md** (github.com/google-labs-code/design.md; Apache-2.0; ~29k stars; npm
  `@google/design.md` 0.4.0, 2026-07-27, nothing since; the spec says "alpha"): YAML tokens
  (colours, typography, rounded, spacing, motion, components with references) followed by
  fixed prose sections. The CLI runs `lint` (11 rules, including WCAG 4.5:1 contrast and broken
  references), `diff`, `export` (json-tailwind, css-tailwind, dtcg) and `spec`. On Windows,
  call it as `designmd`. Stitch uses the same format. [full]
- **DTCG Format Module 2025.10:** first stable release on 2025-10-28, a Community Group report
  rather than a W3C standard. Style Dictionary 5.8.0 (2026-11-03) reads it; Tailwind `@theme`
  output needs a custom format, or Terrazzo's plugin. [snip]
- **Drift advice:** one source, with everything else generated and checked in CI
  ("regenerate, then `git diff --exit-code`"); never hand-copy values. [snip, plus opinion]

### Browser testing and review
- **Screenshot cost** on current models: ceil(w/28) × ceil(h/28) tokens, capped at 4,784
  (vision docs). That is about 250 tokens at 320×568, 430 at 390×844, 1,040 at 768×1024 and
  1,330 at 1280×800. A six-width matrix of viewport shots costs about 4 to 5k tokens; full-page
  captures cost the most. [full, computed]
- **Agent tools:**
  - Playwright MCP: accessibility snapshots by default; vision, images, headless mode and an
    isolated profile are flags.
  - Playwright CLI: `npx playwright cli` is bundled since 1.62; it runs headless and keeps a
    browser daemon alive.
  - One informal measurement (Checkly, 2026-07-30): about 48 to 50k tokens per session over MCP
    against 45 to 48k over the CLI. The gap is small now that Claude Code loads MCP tools on
    demand.
  - Playwright Test Agents (since 1.56): planner, generator and healer, for writing tests, not
    for review.
  - Chrome DevTools MCP: performance traces, console and network. Pass `--no-performance-crux`
    or trace URLs go to Google.
  - Claude in Chrome: available on Pro, drives the visible browser, Windows has known issues,
    keep it off by default.
  - The official `playwright` plugin runs `@playwright/mcp@latest` with no flags: an unpinned,
    headed browser with images on.
- **CI:** `toHaveScreenshot` baselines are specific to platform and browser, so generate them on
  Linux; tune `threshold` and `maxDiffPixels`. `@axe-core/playwright` filters by WCAG tags.
  Lighthouse CI 0.16 budgets need several runs to tame variance. Public repos get free standard
  runners; GitHub Free gives private repos about 2,000 Linux minutes a month. [full and snip]
- **Expo:** Maestro flows locally or on EAS Workflows (the free plan has about 60 workflow
  minutes; whether Maestro runs count against them is unclear). No documented screenshot or
  accessibility assertions in Maestro. [snip]

## 10. Gaps

- Pro's numeric limits are unpublished; secondary claims that they doubled in May 2026 are
  unconfirmed.
- No first-hand text from the Sonnet 5.5, Opus 5.5 or Fable 5.x system cards on tests being
  special-cased or edited.
- No independent cost measurement of superpowers 7.x.
- Not read: hooks.md after about 200k characters, plugins/publish.md (marketplaces), workflows.md.
- The Radar Vol. 35 entries rest on one summarised fetch.
- Some toolchain configuration advice came from the researchers' general knowledge; their
  reports flagged it.
