# asana-task plugin — design

Date: 2026-10-23. Status: design, reviewed; decisions in §8.

## 1. Intent

Package the `asana-task` pipeline (Asana link in → reviewed, QA'd commit and PR out) as a Claude Code plugin that any developer can install from GitHub and use on their own repos, in Claude Code CLI, the Claude Code desktop app, Orca, or (degraded) Codex/Cursor.

Why: as a plain skill the pipeline lives in one `~/.claude/skills` folder, tends to accumulate one machine's paths, one team's repo knowledge and one person's habits, and relies on the model remembering its own red flags. A plugin lets the process be shared, versioned, and partly enforced by hooks instead of prose.

## 2. Goals, non-goals, anti-goals

Goals
- One install command gives a developer the full pipeline: skill, hooks, QA/review agents, Phase 0 scripts, MCP config.
- Zero repo knowledge inside the plugin. Everything repo-specific (branches, commands, QA method, traps) lives in a per-user, per-repo profile that the plugin creates on first contact and keeps updating as tasks teach it.
- Zero machine knowledge inside the plugin. Paths, ports, worktree backend live in a per-user config the plugin creates on first run.
- Works without Orca and without Codex: plain `git worktree`, Claude writes the code. Uses them when present.
- The three worst mistakes are blocked by hooks, not by memory: `git add .`/`git add -A`, `git push` before the user said push, `--no-verify` after a failed hook.
- Depends on `superpowers` and the `ponytail` skill rather than copying them; degrades gracefully when missing.
- Can be exported as a plain skill folder for Codex (`.agents/skills`) with no hooks.
- A README that a newcomer can read in ten minutes and understand what the plugin is for, why it exists, and how a task flows through it.

Non-goals
- Not a company-specific plugin. No repo names, client names, branch conventions, tool ids or people anywhere in the plugin or its docs.
- Not a replacement for superpowers/ponytail. We call them.
- Not a UI/mod. No panels, status lines, toasts.
- Not an Asana client. Asana access stays on the user's existing Asana MCP connector.

Anti-goals (failure even if it "works")
- Someone installs it and the first run fails on a missing tool or a Windows path. First run on a fresh machine must either work or explain exactly what is missing.
- The pipeline silently widens scope, pushes, or posts to Asana without an explicit instruction. Outward actions remain user-gated.
- The profile generator "guesses" base branches or QA method and the guess is wrong in a way the user does not see. A new profile is shown as a draft before first use, and every later change to it is reported in the task summary.
- Two sources of truth for the process (skill text in the plugin vs a stale copy in a repo or in Codex). The plugin is canonical; exports are generated.

## 3. Constraints (verified against docs 2026-10-23)

- Manifest at `.claude-plugin/plugin.json`; only `name` required. Components at plugin root: `skills/<name>/SKILL.md`, `agents/*.md`, `hooks/hooks.json`, `.mcp.json`, `bin/`. Component paths in the manifest must start with `./`.
- Plugin name must not start with `claude-`, `anthropic-`, `cc-plugin-`. Chosen name: `asana-task`. Skill is addressed as `/asana-task:asana-task`; keep the trigger phrases in the skill description so bare Asana URLs still route.
- `${CLAUDE_PLUGIN_ROOT}` changes on update: scripts only. `${CLAUDE_PLUGIN_DATA}` persists: user config and per-task briefs go there.
- Plugin agents: `hooks`, `mcpServers`, `permissionMode` in agent frontmatter are ignored; MCP goes in `.mcp.json`, hooks in `hooks/hooks.json`.
- PreToolUse hook blocks with exit code 2 (stderr = reason) or JSON `permissionDecision: deny|ask`. Matcher `Bash` plus `if: "Bash(git *)"` to narrow.
- Dependencies: `plugin.json` `dependencies: ["superpowers@<marketplace>"]` auto-install. Cross-plugin skill invocation from a skill body is not documented; treat as best-effort with a fallback section in the skill. `ponytail` ships inside `anthropic-skills`; same treatment.
- Marketplace: `.claude-plugin/marketplace.json` in the same repo, plugin `source: "./"` (validate with `claude plugin validate`; fall back to `./plugins/asana-task` layout if root source is rejected). Install: `/plugin marketplace add <owner>/asana-task-plugin` then `/plugin install asana-task@<marketplace-name>`. Set `version` in `plugin.json` and bump on release.
- Desktop app supports plugins and plugin skills; whether plugin hooks run there is unverified. Design hooks so that their absence degrades to "the skill text still says the rule".
- Codex reads `SKILL.md` folders from `.agents/skills`/`~/.agents/skills`, not `.claude-plugin`. Cursor reads Claude hooks from `.claude/settings*.json`, not from plugins. So the export is: skill folder for Codex; optional hooks snippet for Cursor users to paste into `.claude/settings.json`.
- Windows is a first-class target. Hook scripts are Node (`node` is guaranteed by the repos themselves), not bash/python. CRLF-safe file handling.

## 4. Shape

```
asana-task-plugin/                      (GitHub: <owner>/asana-task-plugin)
  README.md                             purpose, why, how it works, install (see §5.9)
  .claude-plugin/plugin.json            name, version, description, author, dependencies
  .claude-plugin/marketplace.json       single-plugin marketplace, source "./"
  skills/asana-task/SKILL.md            the pipeline (Phases 0–7), generic
  skills/asana-task/references/
      profile-schema.md                 what a repo profile must contain, with an annotated example
      fallback-rules.md                 the 6–8 rules we rely on from superpowers/ponytail, for when they are absent
      backends.md                       worktree backends: git-worktree (default), orca; worker backends: claude (default), codex
  agents/qa.md                          QA agent: takes criteria + URL/query path + creds in prompt; PASS/FAIL per criterion with evidence
  agents/reviewer.md                    diff reviewer: gets brief + diff, no implementation context; ranked findings
  agents/scout.md                       "already fixed?" scout: gh pr search by gid and keywords, git log on suspect files, client-vs-main diff
  hooks/hooks.json                      PreToolUse on Bash; Stop (brief/DBG check, warn only)
  hooks/guard.js                        the three blocks + warnings; reads a per-session "push allowed" flag
  bin/asana-task-*                      Phase 0 scripts (see §5)
  export/codex/                         generated: skills/asana-task/SKILL.md + references, no hooks
  scripts/build-export.js               regenerates export/ from skills/ (run before release)
  docs/
      profile-guide.md                  what the profile holds, where it lives, how it grows, how to edit it by hand
      superpowers/specs/                this spec
  tests/                                plugin eval cases (trigger on URL, profile missing path, hook blocks)
```

## 5. Behaviour

### 5.1 First run on a machine (SessionStart or first skill invocation)
- If `${CLAUDE_PLUGIN_DATA}/config.json` is missing, the skill runs a short setup: detects `git`, `gh` (logged in?), `node`, `orca`, `codex`, Asana MCP tools present, Playwright MCP present. Writes `config.json`: worktree root (default `<repo-parent>/.worktrees/<repo>/<task>`), worktree backend (`orca` if found, else `git`), worker backend (`codex` if found and user agrees, else `claude`), preferred dev port range, OS line-ending note.
- Missing `gh` login or Asana connector: stop with the exact command/toggle to fix. Nothing else is attempted.

### 5.2 Repo profile (per user, self-maintained)
- A profile is the plugin's memory about one repository for one user. It lives at `${CLAUDE_PLUGIN_DATA}/profiles/<repo-key>.md`, where `<repo-key>` is derived from the `origin` remote (host/owner/name). It is never committed to the repo and never shared through this plugin. Each user grows their own; an existing hand-written notes file can be imported as a starting profile.
- Format: Markdown with fixed H2 sections so scripts can parse it: `Repo` (default base, client/feature-branch pattern and how the ticket's client field maps to it, prod-vs-uat rule), `Commands` (install, typecheck, lint, unit test, dev server), `Routing` (where code-path docs live), `QA` (browser | query-path | cli, with how), `Forbidden diffs`, `Traps` (one line each, each with a `verified: YYYY-MM-DD` date), `Deploy check`.
- First contact with a repo: the skill drafts the profile by scanning `package.json`, git hooks, `git branch -r` patterns, `AGENTS.md`/`CLAUDE.md`, CI workflows, shows the draft, and writes it on approval. The pipeline then continues.
- Growth is mechanical, not a chore: Phase 7 writes new traps, corrected commands and branch facts straight into the profile (this replaces "propose a PR to repo docs"). The task report lists what changed in the profile so the user can veto.
- Ageing: when the skill relies on a trap older than 60 days it re-verifies it cheaply (run the command, check the branch exists) before trusting it, and refreshes the date or removes the entry. Commands in `Commands` are probed on Phase 3 start; one that does not exist is flagged, not executed.
- Optional shared seed: if a repo happens to contain `.agent/pipeline.md`, it is read first and the user profile overrides it. Nothing in this plugin requires or creates that file.
- Precedence: user profile > repo seed > user config > plugin defaults.

### 5.3 The pipeline (unchanged in substance)
Phases 0–7 as in the current SKILL.md, with repo-specific sentences replaced by "per profile §X". Changes:
- Phase 0 uses `agents/scout.md` for "already fixed?" and client-vs-main checks. Asana reads stay model-side through the user's connector; `bin/asana-task-brief` only creates the brief skeleton from the saved task JSON.
- Phase 3 picks the worktree and worker backend from config; `references/backends.md` holds the exact commands for each. Orca-specific traps (`--setup skip`, worktree vanishing after rename) live there, under the orca section only.
- Phase 5 dispatches `agents/qa.md`. QA method comes from the profile. Credentials: only from the conversation, passed in the agent prompt, never to disk.
- Phase 6: "push on request" is enforced by the hook (§5.4). The skill, when the user says push, records that permission for the current session via `bin/asana-task-allow-push` before pushing.
- Phase 7: brief lives at `${CLAUDE_PLUGIN_DATA}/briefs/<repo-key>/<branch>.md`; repo knowledge learned during the task is written into the profile (§5.2); only cross-repo, personal lessons still go to the user's memory.

### 5.4 Hooks (PreToolUse on Bash, Node script)
Block (exit 2 with reason):
- `git add .`, `git add -A`, `git add --all`.
- `git push` when no push grant exists for this repo+branch. Grants live at `${CLAUDE_PLUGIN_DATA}/grants/<sha1(repo-root)>/<branch>.push` and are written by `bin/asana-task-allow-push <branch>`, which the skill runs only after the user explicitly asked to push. One grant = one push; the hook deletes it on use. "Push both" = two grants. The hook message tells the model to ask the user.
- `git push --no-verify` / `-n` unless a `.hook-passed` marker from the same session exists (written by the skill after it sees "Push allowed!" from the pre-push hook in the previous attempt).
- `git push --force` / `--force-with-lease` / `+refs` always (policy already blocks it; the hook makes the reason explicit).
Warn (exit 0 with `additionalContext`):
- `git commit` while the staged diff contains `[DBG`, `package-lock.json`, or any path listed under the profile's `Forbidden diffs`.
- `npm ci --no-package-lock`, repo-wide formatter commands (`prettier --write .`, `eslint --fix .`).
Ask (JSON `permissionDecision: ask`): `gh pr create`, `gh pr comment`, and the Asana `add_comment` MCP tool while a pipeline is active, so the user confirms every outward action even if the model believed it was authorised.

**Scope of all hook rules:** the rules fire only while the pipeline is active for the current repo+branch, i.e. a brief exists at `${CLAUDE_PLUGIN_DATA}/briefs/<sha1(repo-root)>/<branch>.md`. Outside the pipeline the hook exits 0 and does nothing, so ordinary sessions are untouched. The `git add .` block follows the same scope (acceptance #3 is adjusted). Trade-off accepted: the guard is bypassable by not running the skill.
Non-goals for hooks: no network, no Asana calls, no parsing of commit messages.

### 5.5 Agents
- `qa`: model `sonnet` by default (profile may override), tools: Bash, Read, Playwright MCP tools (whatever server the user already has; the plugin ships none, see §8), WebFetch. Input contract in the prompt: criteria list, how to reach the app/query, credentials, changed-file scope. Output: table PASS/FAIL per criterion with screenshot/console/SQL evidence paths; regression pass over adjacent UI/queries.
- `reviewer`: tools Read, Grep, Bash (read-only git). Input: brief + `git diff`. No implementation transcript. Output: ranked findings (blocker / should-fix / cosmetic / env-noise).
- `scout`: tools Bash (gh, git), Read, Grep. Output: existing PRs by gid and keywords, commits on suspect files since task creation, client-vs-main verdict (client-only / shared / already fixed on main) with the diff evidence.

### 5.6 Dependencies and fallback
- `plugin.json`: `dependencies: ["superpowers@claude-plugins-official"]` (name to be confirmed with `claude plugin list`). `ponytail` is a skill in `anthropic-skills`; if that cannot be declared as a dependency, README says to install it.
- SKILL.md keeps "REQUIRED SUB-SKILL" lines but each is followed by: "If the skill is not available, apply `references/fallback-rules.md` §N." The fallback file is short (≤ 60 lines) and names the source skill so people can go install it.

### 5.7 Export for Codex / Cursor
- `scripts/build-export.js` copies `skills/asana-task/` to `export/codex/skills/asana-task/`, strips hook-dependent sentences (marked in SKILL.md with an HTML comment `<!-- hooks-only -->` on the line), and writes `export/cursor/claude-hooks-snippet.json` with the same guard as a user-level hook for people who want it in `.claude/settings.json`.
- README section "Codex": copy `export/codex/skills/asana-task` to `~/.agents/skills/`. Orca/Codex workers then get the same text.

### 5.8 Distribution
- Repo `<owner>/asana-task-plugin`, MIT. `version` in `plugin.json`, bumped per release; `claude plugin validate --strict` in a GitHub Action on PRs.
- Install: `/plugin marketplace add <owner>/asana-task-plugin`, `/plugin install asana-task@asana-task-plugin` (marketplace name = repo name, my call).
- Team-wide: a repo may pin it via `.claude/settings.json` `--scope project`; not part of v1.

### 5.9 README
README order, written for a reader who has never seen the skill:
1. **What it is** in three sentences: paste an Asana link, get a reviewed, QA'd branch and PR; you decide scope and when to push.
2. **Why it exists**: the four recurring failures it was built against (scope creep into "Related" items, fixing a client branch while main stays broken, re-implementing something already merged elsewhere, pushing or posting before being asked). One sentence each, with what the plugin does about it.
3. **How it works**: the seven phases as a short table (phase, what happens, what you see, what can stop it), then the three building blocks: repo profile, machine config, hooks. One diagram of the flow (ASCII in README; SVG optional).
4. **Illustrative flow**: one invented, generic task walked through the phases in ~15 lines, so the reader sees what each phase produces. Invented on purpose: no real task, repo, client or ticket ever appears in this repository.
5. **Install** (5 minutes): marketplace add, plugin install, dependencies, first run, Asana connector toggle, optional Playwright.
6. **Your first repo**: what the profile draft looks like, how to correct it, where it lives.
7. **Without Claude Code**: Codex export, Cursor hooks snippet.
8. **Limits**: desktop hooks unverified, Asana via connector only, Windows-first.


## 6. Left to the builder

- Exact hook JSON (matchers, `if` filters) and the Node guard implementation with tests for each blocked/warned pattern, including Windows path quoting.
- The profile parser (fixed H2 headings → object), the draft generator, the Phase 7 profile writer and the 60-day re-verification.
- Agent prompt wording, modelled on the current Phase 5 QA instructions and the reviewer mindset in `superpowers:requesting-code-review`.
- `build-export.js` and the eval cases under `tests/`.
- README per §5.9, including the invented illustrative flow.
- Confirm root `source: "./"` marketplace layout validates; otherwise move the plugin under `plugins/asana-task/`.

## 7. Acceptance for v1

1. Fresh Windows machine with Claude Code CLI, `gh` logged in, Asana connector on: install, open a repo without a profile, paste an Asana URL → the skill triggers, explains the missing profile, drafts one, and stops for approval.
2. In a repo whose profile already exists: a UI bug task goes through Phases 0–6 with QA by the `qa` agent, and `git push` is refused by the hook until the user says push.
3. `git add .` is refused with a reason whenever a brief exists for the current repo+branch; in a repo/branch without a brief it is allowed.
4. `superpowers` uninstalled: the skill still runs and names the fallback rules it applied.
5. The Codex export loads as a skill in Codex and reads as the same pipeline without hook references.
6. No company identifier (repo names, client names, ticket ids, PR numbers, Orca repo ids, personal machine paths) appears anywhere in this repository, including docs. A CI grep over a denylist kept outside the repo (in the maintainer's local config, never committed) enforces it.
7. A new reader reads README top to bottom and can say in their own words what the plugin is for and what the seven phases are, without opening SKILL.md.

## 8. Decisions after the builder check

Product decisions:
- Hook rules apply only while the pipeline is active for the current repo+branch (brief exists). Never globally.

Implementation decisions, open to revision:
- Push grant keyed on repo root + branch, not session id (the model cannot see the session id). One grant per push, consumed on use.
- `gh pr create`, `gh pr comment` and Asana `add_comment` get an `ask` hook inside the pipeline, not `deny`.
- Playwright MCP is detected, not shipped. If absent, first-run output names the install step; FE QA is then marked "skipped: no browser" rather than failing.
- When `CLAUDE_PLUGIN_DATA` is unset (older CLI), scripts fall back to `~/.claude/asana-task-data/`. No minimum version pinned; README lists which features need a current CLI.
- `config.json` gets `repos.<name>: { checkoutPath?, devPort?, workspaceMode: worktree|single-checkout }`. Orca repo ids are never stored; resolved at runtime via `orca repo list --json` by repo name.
- Profiles are per user: never proposed as PRs to the repos they describe. A profile is drafted by the plugin on first contact with a repo and grows from there; an existing notes file can be imported.

