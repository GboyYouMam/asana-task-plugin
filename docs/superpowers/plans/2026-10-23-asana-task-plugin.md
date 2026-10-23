# asana-task Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of the `asana-task` Claude Code plugin: the pipeline skill, per-user repo profiles, machine config, scoped git guard hooks, three agents, a Codex export, and a README, installable from a GitHub marketplace.

**Architecture:** A Markdown skill drives the pipeline; small Node scripts under `bin/` and `lib/` own the on-disk state (config, profiles, briefs, push grants) so the skill, the hooks and the agents share one source of truth. Hooks are a single Node guard that is inert unless a brief exists for the current repo+branch. No runtime dependencies; tests use `node:test`.

**Tech Stack:** Node ≥ 20 (`node:test`, `node:fs`, `node:child_process`), Markdown, JSON. Claude Code plugin format (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `agents/*.md`, `skills/*/SKILL.md`).

**Spec:** `docs/superpowers/specs/2026-10-23-asana-task-plugin-design.md`

## Global Constraints

- Plugin name `asana-task`; skill invoked as `/asana-task:asana-task`. Name must not start with `claude-`, `anthropic-`, `cc-plugin-`.
- No runtime npm dependencies. Scripts are Node, never bash or python, and must run on Windows (CRLF-safe reads, `path.join`, no `$HOME` assumptions).
- State root = `path.join(os.homedir(), ".claude", "asana-task-data")`, override `ASANA_TASK_DATA` (Task 9 ruling: `CLAUDE_PLUGIN_DATA` is absent from shell-command environments). Never write under `CLAUDE_PLUGIN_ROOT`.
- Hook rules fire only when a brief exists at `<data>/briefs/<repo-key>/<branch>.md`. Outside that: exit 0, no output.
- Hook block = exit code 2 with the reason on stderr. Ask = JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"..."}}` on stdout, exit 0. Warn = JSON with `additionalContext`, exit 0.
- `repo-key` = `host/owner/name` from the `origin` remote URL, lowercase, `.git` stripped, path separators replaced by `__` when used as a directory name.
- No company identifiers anywhere in the repo (names of repos, clients, tickets, PRs, people, machine paths). CI runs `scripts/check-denylist.js`, which reads the denylist from `process.env.ASANA_TASK_DENYLIST` (a file path outside the repo) and skips with a notice when unset.
- Every file in the repo is generic: examples use `example-app`, `client-x`, `TASK-123`.
- Commit messages: Conventional Commits; add `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A Bash command that contains `git add .` inside a longer string (e.g. `echo "git add ."`) must not be blocked; the guard must tokenise the command, not substring-match. Test in Task 5.
2. A detached-HEAD worktree (no branch) must make the guard inert and make `asana-task-brief` refuse with a clear message rather than writing `briefs/<key>/HEAD.md`. Tests in Tasks 4 and 5.
3. A profile file edited by hand with an unknown H2 heading must still parse; unknown sections are preserved on save, not dropped. Test in Task 3.
4. `CLAUDE_PLUGIN_DATA` set to a path with spaces (Windows user names) must work for config, profile, brief and grant paths. Test in Task 2.
5. A repo with no `origin` remote must produce a usable repo-key (`local/<dirname>`) instead of crashing in Phase 0. Test in Task 3.

---

### Task 1: Plugin skeleton, manifest, marketplace, CI denylist check

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json`, `LICENSE` (MIT), `.gitignore`, `scripts/check-denylist.js`, `.github/workflows/ci.yml`
- Test: `tests/check-denylist.test.js`

**Interfaces:**
- Produces: `npm test` runs `node --test tests/`; `npm run check:denylist` runs the grep; `claude plugin validate .` passes.

- [ ] **Step 1: Write `tests/check-denylist.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../scripts/check-denylist.js";

test("returns matching file:line for denylisted words, case-insensitive", () => {
  const hits = scan(["foo-corp", "secretclient"], { "docs/a.md": "Hello Foo-Corp\nok\nsecretclient here" });
  assert.deepEqual(hits, ["docs/a.md:1 foo-corp", "docs/a.md:3 secretclient"]);
});
test("empty denylist yields no hits", () => {
  assert.deepEqual(scan([], { "a.md": "anything" }), []);
});
```

- [ ] **Step 2: Run `npm test` → FAIL (module missing)**

- [ ] **Step 3: Implement `scripts/check-denylist.js`**

Exports `scan(words: string[], files: Record<string,string>): string[]`. When run as main: reads `process.env.ASANA_TASK_DENYLIST`; if unset prints `denylist: skipped (ASANA_TASK_DENYLIST not set)` and exits 0; otherwise walks the repo (skip `.git`, `node_modules`), calls `scan`, prints hits, exits 1 if any.

- [ ] **Step 4: Write `.claude-plugin/plugin.json`**

```json
{ "name": "asana-task", "version": "0.1.0", "description": "Asana link in, reviewed and QA'd PR out: a guarded task pipeline for Claude Code", "author": { "name": "GboyYouMam" }, "license": "MIT", "keywords": ["asana", "workflow", "pipeline", "git"], "dependencies": ["superpowers@claude-plugins-official"] }
```

- [ ] **Step 5: Write `.claude-plugin/marketplace.json`**

```json
{ "name": "asana-task-plugin", "owner": { "name": "GboyYouMam" }, "plugins": [{ "name": "asana-task", "source": "./", "description": "Asana link in, reviewed and QA'd PR out" }] }
```

- [ ] **Step 6: Write `package.json`** with `"type": "module"`, `"scripts": { "test": "node --test tests/", "check:denylist": "node scripts/check-denylist.js", "build:export": "node scripts/build-export.js" }`, `"engines": { "node": ">=20" }`, no dependencies.

- [ ] **Step 7: Write `.github/workflows/ci.yml`**: on push/PR, Node 20, `npm test`, `npm run check:denylist`, `npx @anthropic-ai/claude-code plugin validate . --strict` (if that package name is wrong, use the documented `claude plugin validate` invocation and note it in README).

- [ ] **Step 8: Run `npm test` → PASS; run `claude plugin validate .` → prints valid.** If `source: "./"` is rejected, move everything except `.claude-plugin/marketplace.json` under `plugins/asana-task/` and set `source: "./plugins/asana-task"`; update every path in this plan accordingly.

- [ ] **Step 9: Commit** `chore: plugin skeleton, marketplace and denylist check`

---

### Task 2: Data directory and machine config

**Files:**
- Create: `lib/data-dir.js`, `lib/config.js`, `lib/detect.js`, `bin/asana-task-setup`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `dataDir(): string`; `loadConfig(): Config | null`; `saveConfig(c: Config): void`; `detectTools(): Tools`; `Config = { worktreeRoot: string, worktreeBackend: "git"|"orca", workerBackend: "claude"|"codex", devPortStart: number, repos: Record<string,{ checkoutPath?: string, devPort?: number, workspaceMode?: "worktree"|"single-checkout" }> }`; `Tools = { git: boolean, gh: boolean, ghLoggedIn: boolean, node: boolean, orca: boolean, codex: boolean }`.

- [ ] **Step 1: Write `tests/config.test.js`**

```js
test("dataDir uses CLAUDE_PLUGIN_DATA when set, even with spaces", () => {
  process.env.CLAUDE_PLUGIN_DATA = path.join(os.tmpdir(), "a b", "data");
  assert.equal(dataDir(), process.env.CLAUDE_PLUGIN_DATA);
});
test("dataDir falls back to ~/.claude/asana-task-data", () => {
  delete process.env.CLAUDE_PLUGIN_DATA;
  assert.equal(dataDir(), path.join(os.homedir(), ".claude", "asana-task-data"));
});
test("saveConfig then loadConfig round-trips and creates the directory", () => { /* tmp dir; assert deepEqual */ });
test("loadConfig returns null when no config.json", () => {});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `lib/data-dir.js` (`dataDir`), `lib/config.js` (`loadConfig`, `saveConfig` → `<data>/config.json`, mkdir -p), `lib/detect.js` (`detectTools` via `spawnSync(cmd, ["--version"])` with `shell: process.platform === "win32"`; `ghLoggedIn` = `gh auth status` exit 0).**

- [ ] **Step 4: Implement `bin/asana-task-setup`** (Node shebang, `.cmd` shim not needed: Claude Code adds `bin/` to PATH and invokes via `node` when the file has a `.js` sibling; implement as `bin/asana-task-setup.js` and reference it as `node "${CLAUDE_PLUGIN_ROOT}/bin/asana-task-setup.js"` from the skill). Behaviour: if config exists print it and exit 0; else run `detectTools`, print a table, print the missing-blocker lines verbatim: `gh is not logged in: run gh auth login`, `Asana connector: enable the Asana MCP connector in Claude settings` (the script cannot detect MCP; always print as a reminder once), then write defaults: `worktreeRoot = path.join(cwd, "..", ".worktrees")`, `worktreeBackend = orca ? "orca" : "git"`, `workerBackend = "claude"`, `devPortStart = 8082`, `repos = {}`.

- [ ] **Step 5: Run `npm test` → PASS; run `node bin/asana-task-setup.js` in a temp `CLAUDE_PLUGIN_DATA` → prints table and writes config.**

- [ ] **Step 6: Commit** `feat: data dir, machine config and tool detection`

---

### Task 3: Repo key and profile (parse, save, draft, ageing)

**Files:**
- Create: `lib/repo-key.js`, `lib/profile.js`, `lib/profile-draft.js`, `bin/asana-task-profile.js`, `skills/asana-task/references/profile-schema.md`
- Test: `tests/profile.test.js`

**Interfaces:**
- Produces: `repoKey(cwd: string): string` (`host/owner/name` or `local/<dirname>`); `repoKeyDir(key): string` (`/`→`__`); `parseProfile(md: string): Profile`; `serializeProfile(p: Profile): string`; `loadProfile(key): Profile | null`; `saveProfile(key, p): void`; `staleTraps(p, today: Date, days = 60): Trap[]`; `draftProfile(cwd): Profile`; `Profile = { sections: Record<string,string>, traps: Trap[], order: string[] }`; `Trap = { text: string, verified: string /* YYYY-MM-DD */ }`.
- Sections (H2, exact): `Repo`, `Commands`, `Routing`, `QA`, `Forbidden diffs`, `Traps`, `Deploy check`. `Traps` lines: `- <text> (verified: YYYY-MM-DD)`.

- [ ] **Step 1: Write `tests/profile.test.js`**

```js
test("repoKey from ssh and https origins", () => {
  assert.equal(repoKeyFromUrl("git@github.com:Owner/Example-App.git"), "github.com/owner/example-app");
  assert.equal(repoKeyFromUrl("https://github.com/owner/example-app"), "github.com/owner/example-app");
});
test("repoKey without origin uses local/<dirname>", () => { /* git init tmp, no remote */ });
test("parseProfile reads fixed sections and traps with dates, keeps unknown sections", () => {
  const p = parseProfile("## Repo\nbase: main\n\n## Traps\n- npm ci fails on 1.x (verified: 2026-01-01)\n\n## Notes\nkeep me\n");
  assert.equal(p.sections.Repo.trim(), "base: main");
  assert.deepEqual(p.traps, [{ text: "npm ci fails on 1.x", verified: "2026-01-01" }]);
  assert.equal(p.sections.Notes.trim(), "keep me");
  assert.ok(serializeProfile(p).includes("## Notes"));
});
test("staleTraps returns traps older than 60 days", () => {});
test("draftProfile fills Commands from package.json scripts and Repo from branches", () => {
  // tmp repo with package.json {scripts:{test:"jest",typecheck:"tsc"}} and branches main, client/x-uat
  // assert Commands contains "test: npm test" and "typecheck: npm run typecheck"; Repo contains "default base: main" and "client branches: client/<name>-uat"
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `lib/repo-key.js`** (`git remote get-url origin` via spawnSync; parse with a regex for `git@host:path` and `scheme://host/path`).

- [ ] **Step 4: Implement `lib/profile.js`** (parse: split on `^## `, trap regex `^- (.+) \(verified: (\d{4}-\d{2}-\d{2})\)$`; serialize in `order`; paths `<data>/profiles/<repoKeyDir>.md`).

- [ ] **Step 5: Implement `lib/profile-draft.js`**: scan `package.json` scripts (map `test|typecheck|check-types|lint|start|dev` → Commands), `git branch -r` (default base = `main` if exists else `master`; client pattern = common prefix of branches matching `/^origin\/([a-z]+)\/.+-uat$/`), `.husky/*` or `package.json` `lint-staged` → Forbidden diffs hint `package-lock.json` when `npm ci` appears in hooks, `AGENTS.md|CLAUDE.md` → Routing line `read AGENTS.md first` when present. Leave `QA` as `browser` when `react`/`vue`/`next` in deps, else `query-path`. Traps empty.

- [ ] **Step 6: Implement `bin/asana-task-profile.js`** with subcommands: `show` (prints profile or `no profile for <key>`), `draft` (prints draft markdown to stdout, does not write), `write` (reads markdown from stdin, saves), `import <file>` (reads a file, saves as the profile for cwd), `stale` (prints stale traps, one per line).

- [ ] **Step 7: Write `skills/asana-task/references/profile-schema.md`**: the seven sections, one annotated generic example (`example-app`), the trap line format, the ageing rule (60 days), where the file lives.

- [ ] **Step 8: Run `npm test` → PASS. Commit** `feat: repo profiles with draft generator and trap ageing`

---

### Task 4: Briefs and push grants

**Files:**
- Create: `lib/brief.js`, `lib/grants.js`, `bin/asana-task-brief.js`, `bin/asana-task-allow-push.js`
- Test: `tests/brief-grants.test.js`

**Interfaces:**
- Produces: `currentBranch(cwd): string | null` (null on detached HEAD); `briefPath(key, branch): string` (`<data>/briefs/<repoKeyDir>/<branch with "/"→"__">.md`); `createBrief(key, branch, { title, ticketUrl }): string` (writes skeleton, returns path); `hasBrief(key, branch): boolean`; `grantPath(key, branch)`; `grantPush(key, branch): void`; `consumePush(key, branch): boolean` (true if a grant existed and was deleted).
- Brief skeleton sections: `# <title>`, `Ticket: <url>`, `## Status`, `## Acceptance criteria`, `## Files to change`, `## Files that must not change`, `## Tests affected`, `## Verify`, `## QA`, `## Profile changes`.

- [ ] **Step 1: Write `tests/brief-grants.test.js`**: createBrief writes the skeleton and `hasBrief` is true; `currentBranch` returns null on detached HEAD and `asana-task-brief` exits 1 with `refusing: detached HEAD`; `grantPush` then `consumePush` → true, second `consumePush` → false; branch names with `/` map to `__` in both paths.

- [ ] **Step 2: Run → FAIL. Step 3: Implement the two libs and two bins** (`asana-task-brief.js create --title "<t>" --ticket "<url>"`, `asana-task-brief.js path`, `asana-task-brief.js status "<one line>"` rewrites the `## Status` section; `asana-task-allow-push.js [branch]` defaults to current branch, prints `push granted for <key> <branch>`).

- [ ] **Step 4: Run → PASS. Commit** `feat: task briefs and one-shot push grants`

---

### Task 5: Guard hook

**Files:**
- Create: `hooks/hooks.json`, `hooks/guard.js`, `lib/guard-rules.js`
- Test: `tests/guard.test.js`

**Interfaces:**
- Consumes: `hasBrief`, `consumePush`, `repoKey`, `currentBranch`, `loadProfile` (for `Forbidden diffs`).
- Produces: `evaluate(input: { tool_name, tool_input: { command }, cwd }, ctx: { active: boolean, grant: () => boolean, forbidden: string[], stagedPaths: () => string[], stagedDiff: () => string }): Decision`; `Decision = { kind: "allow" } | { kind: "block", reason } | { kind: "ask", reason } | { kind: "warn", context }`.

- [ ] **Step 1: Write `tests/guard.test.js`** (pure `evaluate`, no git):

```js
const base = { tool_name: "Bash", cwd: "/r" };
const active = { active: true, grant: () => false, forbidden: [], stagedPaths: () => [], stagedDiff: () => "" };
test("inactive pipeline allows everything", () => assert.equal(evaluate({ ...base, tool_input: { command: "git add ." } }, { ...active, active: false }).kind, "allow"));
test("blocks git add . / -A / --all", () => { for (const c of ["git add .", "git add -A", "git add --all", "git -C x add ."]) assert.equal(evaluate({ ...base, tool_input: { command: c } }, active).kind, "block"); });
test("does not block git add . inside a string", () => assert.equal(evaluate({ ...base, tool_input: { command: 'echo "git add ."' } }, active).kind, "allow"));
test("blocks git push without grant, allows and consumes with grant", () => {
  assert.equal(evaluate({ ...base, tool_input: { command: "git push -u origin x" } }, active).kind, "block");
  let used = 0; const g = { ...active, grant: () => { used++; return true; } };
  assert.equal(evaluate({ ...base, tool_input: { command: "git push -u origin x" } }, g).kind, "allow"); assert.equal(used, 1);
});
test("always blocks force push and --no-verify", () => { for (const c of ["git push --force", "git push --force-with-lease", "git push origin +main", "git push --no-verify", "git push -n"]) assert.equal(evaluate({ ...base, tool_input: { command: c } }, { ...active, grant: () => true }).kind, "block"); });
test("asks on gh pr create / gh pr comment", () => { for (const c of ["gh pr create --base main", "gh pr comment 1 --body x"]) assert.equal(evaluate({ ...base, tool_input: { command: c } }, active).kind, "ask"); });
test("asks on Asana add_comment MCP tool", () => assert.equal(evaluate({ tool_name: "mcp__claude_ai_Asana_v2__add_comment", tool_input: {}, cwd: "/r" }, active).kind, "ask"));
test("warns on commit with [DBG, package-lock.json or forbidden path staged", () => {
  const ctx = { ...active, forbidden: ["src/config/env.ts"], stagedPaths: () => ["package-lock.json"], stagedDiff: () => "+console.log('[DBG x')" };
  const d = evaluate({ ...base, tool_input: { command: "git commit -m x" } }, ctx); assert.equal(d.kind, "warn"); assert.match(d.context, /package-lock\.json/); assert.match(d.context, /\[DBG/);
});
test("warns on npm ci --no-package-lock and repo-wide formatters", () => { for (const c of ["npm ci --no-package-lock", "npx prettier --write .", "npx eslint --fix ."]) assert.equal(evaluate({ ...base, tool_input: { command: c } }, active).kind, "warn"); });
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `lib/guard-rules.js` `evaluate`**: split the command on `&&`, `||`, `;`, `|` outside quotes, tokenise each segment with a small shell-word splitter (respect single/double quotes); match on tokens (`git` with optional `-C <dir>` then subcommand). `ask` for `gh pr create|comment` and any `tool_name` matching `/add_comment$/`.

- [ ] **Step 4: Implement `hooks/guard.js`**: read stdin JSON; `cwd` → `repoKey`, `currentBranch` (null → exit 0); `active = hasBrief(key, branch)`; build ctx (`grant = () => consumePush(key, branch)`, `forbidden` from profile `Forbidden diffs` lines, staged paths via `git diff --cached --name-only`, staged diff via `git diff --cached`); map Decision: block → stderr reason, exit 2; ask/warn → stdout JSON, exit 0; allow → exit 0. Any internal error → exit 0 (never break the user's shell).

- [ ] **Step 5: Write `hooks/hooks.json`**

```json
{ "description": "asana-task guard: active only while a task brief exists for the current repo and branch",
  "hooks": { "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.js"], "timeout": 10 }] },
    { "matcher": "mcp__.*add_comment", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.js"], "timeout": 10 }] } ] } }
```

- [ ] **Step 6: Run `npm test` → PASS. Manual: in a temp git repo with a brief created, `echo '{"tool_name":"Bash","tool_input":{"command":"git add ."},"cwd":"<repo>"}' | node hooks/guard.js; echo $?` → prints reason, exit 2. Same without brief → exit 0.**

- [ ] **Step 7: Commit** `feat: scoped PreToolUse guard for git add, push, force and outward actions`

---

### Task 6: The skill and its references

**Files:**
- Create: `skills/asana-task/SKILL.md`, `skills/asana-task/references/fallback-rules.md`, `skills/asana-task/references/backends.md`
- Test: `tests/skill-text.test.js`

**Interfaces:**
- Consumes: every `bin/*.js` command from Tasks 2–4 by exact name; `profile-schema.md` from Task 3.

- [ ] **Step 1: Write `tests/skill-text.test.js`**: SKILL.md frontmatter has `name: asana-task` and a `description` containing `app.asana.com`; body references each of `asana-task-setup.js`, `asana-task-profile.js`, `asana-task-brief.js`, `asana-task-allow-push.js`; no line contains `C:/Users/` or a UUID (`[0-9a-f]{8}-[0-9a-f]{4}-`), since those would be machine or tool identifiers; every line marked `<!-- hooks-only -->` mentions `hook`.

- [ ] **Step 2: Run → FAIL. Step 3: Write `SKILL.md`**. Port the pipeline from the design (§5.3) as Phases 0–7 with these exact mechanics:
  - Frontmatter `description`: trigger on `app.asana.com/...` links and the phrases "take this task", "investigate", "analyse", plus `/asana-task:asana-task <url>`.
  - Phase 0 opens with: run `node "${CLAUDE_PLUGIN_ROOT}/bin/asana-task-setup.js"` (first run only), then `node "${CLAUDE_PLUGIN_ROOT}/bin/asana-task-profile.js" show`; if `no profile`, run `draft`, show it, write on approval. Read the ticket via the Asana MCP tools; save nothing with credentials.
  - Phase 0 "already fixed?" and "client vs main" are delegated to the `asana-task:scout` agent (Task 7) with the exact prompt fields: ticket id, title keywords, suspect files, base candidates.
  - Phase 2 creates the brief: `asana-task-brief.js create --title ... --ticket ...`, then fills sections.
  - Phase 3 reads `references/backends.md` for worktree/worker commands by `config.worktreeBackend`/`workerBackend`. Branch `fix/<slug>` or `feat/<slug>`.
  - Phase 4 dispatches `asana-task:reviewer`. Phase 5 dispatches `asana-task:qa` with the profile `QA` method; when the method is `browser` and no Playwright MCP tools exist, mark QA `skipped: no browser` in the brief.
  - Phase 6: report, wait for the user's push instruction, then `asana-task-allow-push.js` and push. Mark the three sentences that depend on the hook with `<!-- hooks-only -->`. PR body = ticket link only.
  - Phase 7: `asana-task-brief.js status`, then append learned traps to the profile via `write` (read-modify-write with today's `verified` date), and list profile changes in the final report.
  - "REQUIRED SUB-SKILL" lines for `superpowers:systematic-debugging` (Phase 1), `ponytail` (Phase 2), `superpowers:requesting-code-review` (Phase 4), `superpowers:verification-before-completion` (Phase 6), each followed by "If unavailable, apply `references/fallback-rules.md` §N".
  - Red flags section as in the design.

- [ ] **Step 4: Write `references/fallback-rules.md`** (≤ 60 lines): §1 reproduce before fixing, one hypothesis at a time; §2 shortest diff, reuse existing conventions, no new files unless the brief allows; §3 review against the brief, callers, English comments; §4 run the verify commands and paste the output before claiming done. Each § names the skill it stands in for.

- [ ] **Step 5: Write `references/backends.md`**: `git` backend (`git worktree add <worktreeRoot>/<repo>/<slug> -b fix/<slug> origin/<base>`; cleanup `git worktree remove`), `orca` backend (`orca worktree create ... --setup skip`, rename branch, verify with `git worktree list`, fallback `git worktree add` if the folder vanished), `claude` worker (implement in-session), `codex` worker (`codex exec ... -C <wt> - < brief.md`, model left to config `codexModel` default `gpt-5.6-luna`). Include the `single-checkout` mode: branch in place, `git status` must be clean first.

- [ ] **Step 6: Run `npm test` → PASS. Commit** `feat: asana-task pipeline skill with fallback rules and backends`

---

### Task 7: Agents

**Files:**
- Create: `agents/scout.md`, `agents/reviewer.md`, `agents/qa.md`
- Test: `tests/agents.test.js`

- [ ] **Step 1: Write `tests/agents.test.js`**: each file has frontmatter `name`, `description`, `tools`; `scout` tools ⊆ `Bash, Read, Grep, Glob`; `reviewer` tools ⊆ `Read, Grep, Glob, Bash`; `qa` `model: sonnet`; bodies contain the output-contract headings below.

- [ ] **Step 2: Run → FAIL. Step 3: Write the three agents.**
  - `scout`: input = ticket id, keywords, suspect files, base candidates. Steps: `gh pr list --state all --search "<id>"`, same by keywords, `git log origin/<base> --since=<created> -- <files>`, `git log --all --oneline -- <file>`, `git diff origin/main origin/<client> -- <files>`. Output headings: `## Existing PRs`, `## Commits on suspect files`, `## Client vs main verdict` (one of `client-only | shared | already-fixed-on-main` with the diff evidence), `## Recommendation`.
  - `reviewer`: input = brief path + `git diff <base>`. No implementation transcript. Output headings: `## Blockers`, `## Should fix`, `## Cosmetic`, `## Environment noise`, each item `file:line — claim — why`.
  - `qa`: input = criteria list, how to reach the app or query path, credentials (prompt only), changed-file scope, QA method. Output: `## Verdicts` table `criterion | PASS/FAIL | evidence path`, `## Regression pass`, `## Console/network errors`. Must say `QA SKIPPED: <reason>` when it cannot reach the target.

- [ ] **Step 4: Run → PASS. Commit** `feat: scout, reviewer and qa agents`

---

### Task 8: Codex export and README

**Files:**
- Create: `scripts/build-export.js`, `docs/profile-guide.md`, `README.md`
- Test: `tests/build-export.test.js`

**Interfaces:**
- Produces: `buildExport(srcDir, outDir): { files: string[], strippedLines: number }`; `export/codex/skills/asana-task/**` and `export/cursor/claude-hooks-snippet.json`.

- [ ] **Step 1: Write `tests/build-export.test.js`**: given a tmp skill dir with one `<!-- hooks-only -->` line, output omits that line, keeps the rest, copies `references/`, writes the cursor snippet containing `"PreToolUse"` and `guard.js`.

- [ ] **Step 2: Run → FAIL. Step 3: Implement `scripts/build-export.js`** (export dir is committed; CI runs it and fails if `git diff --exit-code export/` is non-empty).

- [ ] **Step 4: Write `README.md`** in this order (design §5.9): What it is (3 sentences) · Why it exists (four recurring failures, one sentence each, and what the plugin does about each) · How it works (phase table: phase / what happens / what you see / what can stop it; then profile, config, hooks in one paragraph each; one ASCII flow diagram) · Illustrative flow (invented `example-app`, `client-x`, `TASK-123`, ~15 lines) · Install (`/plugin marketplace add GboyYouMam/asana-task-plugin`, `/plugin install asana-task@asana-task-plugin`, dependencies, first run, Asana connector, optional Playwright) · Your first repo · Without Claude Code (Codex export, Cursor snippet) · Limits (desktop hooks unverified, Asana via connector only, Windows-first).

- [ ] **Step 5: Write `docs/profile-guide.md`**: where the profile lives, the seven sections, how it grows, how to import a notes file, how to edit by hand, the 60-day rule.

- [ ] **Step 6: `npm run build:export`, `npm test` → PASS. Commit** `docs: README, profile guide and Codex export`

---

### Task 9: Local install and acceptance run

**Files:**
- Create: `tests/evals/README.md` (manual acceptance checklist, mirrors design §7), `CHANGELOG.md`

- [ ] **Step 1: `claude plugin validate . --strict` → valid.**
- [ ] **Step 2: `claude plugin marketplace add <absolute path to repo>` then `claude plugin install asana-task@asana-task-plugin`; `/reload-plugins`.**
- [ ] **Step 3: Acceptance 1** in a scratch git repo with no profile: paste a ticket URL → skill triggers, drafts a profile, stops for approval. Record the result in `tests/evals/README.md`.
- [ ] **Step 4: Acceptance 3** in the same repo with a brief created: `git add .` via Claude is refused with the reason; after deleting the brief it is allowed.
- [ ] **Step 5: Acceptance 4**: disable `superpowers`, run the skill → it names the fallback rules it applied.
- [ ] **Step 6: Cross-plugin check** (design §3 unverified): with superpowers enabled, confirm the skill actually invoked `superpowers:systematic-debugging`. If not, change the REQUIRED lines to "invoke via the Skill tool" wording and re-test; record the outcome in `tests/evals/README.md` and in README "Limits" if it stays unreliable.
- [ ] **Step 7: Write `CHANGELOG.md` `0.1.0`, commit** `chore: 0.1.0 acceptance notes and changelog`.
- [ ] **Step 8: Hand over.** Do not push; the maintainer creates the GitHub repo and pushes `main`.

---

## Self-review notes

- Spec coverage: §5.1 → Task 2; §5.2 → Task 3; §5.3 → Task 6 (+ Tasks 4, 7); §5.4 → Task 5; §5.5 → Task 7; §5.6 → Tasks 1, 6; §5.7 → Task 8; §5.8 → Tasks 1, 9; §5.9 → Task 8; acceptance §7 → Task 9. Profile import of an existing notes file (§8) → Task 3 `import`.
- Names used across tasks: `repoKey`, `repoKeyDir`, `hasBrief`, `consumePush`, `loadProfile`, `evaluate` are defined where first produced and reused unchanged.
- Review Focus items 1–5 each have a test in Tasks 5, 4/5, 3, 2, 3.
