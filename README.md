# asana-task

Paste an Asana task link into Claude Code and get back a reviewed, QA'd branch with a pull request. You decide the scope and the moment to push; the plugin does the rest and refuses to do the two or three things that go wrong most often.

It is a Claude Code plugin: one skill that drives the task through seven phases, three small agents it delegates to, a guard hook that only wakes up while a task is in flight, and a handful of Node scripts that keep the state on disk. It knows nothing about your company or your repositories: that knowledge lives in a per-user profile the plugin writes for each repository it meets.

## Why it exists

Working tickets with an agent fails in the same four ways, over and over. Each one is a rule in this plugin, and the important ones are enforced, not just written down.

- **Scope creep.** The ticket mentions a "related" issue and the agent fixes that too. The pipeline plans against the ticket's expected result only and lists everything else for you.
- **Fixing the wrong branch.** A client branch gets patched while the default branch keeps the same bug. Before any code, a scout checks whether the defect is client-only, shared, or already fixed elsewhere.
- **Re-implementing merged work.** The same bug is often already fixed on another branch weeks earlier. The scout searches pull requests by ticket id and by symptom and reports cherry-pick targets.
- **Acting before being asked.** Pushing, opening a PR, posting a comment. A push needs an explicit one-shot grant from you; a PR or a comment asks first; `git add .`, force-push and `--no-verify` are blocked outright while a task is active.

## How it works

| Phase | What happens | What you see | What can stop it |
|---|---|---|---|
| 0 Read | Machine config, repo profile, ticket, routing, "already fixed?" scout | A one-paragraph summary and the base branch decision | Missing profile (drafted for your approval), unclear route (a question) |
| 1 Investigate | Trace the real code path, reproduce, name the acceptance criteria | Findings with file paths | Investigate-only requests end here |
| 2 Plan | A brief: criteria, files to change, files not to touch, tests, verify commands | The brief and a scope confirmation; QA credentials requested now | Your veto |
| 3 Build | Worktree from the base, `fix/<slug>` branch, implementation | Progress lines | Dirty checkout in single-checkout mode |
| 4 Review | A reviewer agent that never saw the implementation reads the diff | Ranked findings and what was done about them | Blockers |
| 5 QA | The change exercised the way the reporter would see it: browser, query path or CLI | PASS/FAIL per criterion with evidence | No way to reach the target (reported as skipped, never faked) |
| 6 Deliver | Commit, report, wait for your "push", then push and open the PR | Branch, commit, verdicts, follow-ups | The guard: no grant, no push |
| 7 Checkpoint | Brief status rewritten, what the task taught written into the repo profile | A list of profile changes you can veto | — |

```
  Asana link
      │
      ▼
 ┌─────────┐   profile + config   ┌─────────┐
 │ Phase 0 │ ◄──────────────────  │  disk   │
 │ read    │ ──── scout ────►     │ (yours) │
 └────┬────┘                      └────▲────┘
      ▼                                │
 Phase 1 investigate ─► Phase 2 plan ─►│ brief written
      ▼                                │ (guard wakes up)
 Phase 3 build ─► Phase 4 review ─► Phase 5 QA
      ▼
 Phase 6 deliver ──(you: "push")──► grant ──► push ──► PR (asks first)
      ▼
 Phase 7 checkpoint ─► profile updated, brief closed (guard sleeps)
```

**Profile.** One Markdown file per repository, stored under the plugin's data directory, never in the repository. It holds base branches, commands, where the docs are, how QA is done, forbidden diffs and dated traps. The plugin drafts it on first contact from `package.json`, git hooks, branches and `AGENTS.md`; you correct it once; every later task appends what it learned. Traps older than 60 days get re-verified before they are trusted. See [docs/profile-guide.md](docs/profile-guide.md).

**Config.** One JSON file per machine: where worktrees go, whether Orca or plain `git worktree` is used, whether Claude or Codex writes the code, which dev port to start from. Written on first run after detecting what is installed.

**Hooks.** One Node script on `PreToolUse`. It is inert unless a brief exists for the current repository and branch, which only the pipeline creates. While active it blocks `git add .`/`-A`, blocks `git push` without a grant, always blocks force-push and `--no-verify`, asks before `gh pr create`/`comment` and before an Asana comment, and warns on commits that carry `[DBG` lines, a lockfile or a forbidden path.

## An illustrative flow

Invented on purpose; no real task, repository or client appears in this repository.

> You paste a link to TASK-123: "Saving notification settings sends three of the four KYC event names".
>
> Phase 0 finds the profile for `example-app`, reads the ticket, notes the client field says `client-x` and the impact field says "default branch". The scout finds no PR for TASK-123, no symptom match, and reports the suspect file is identical on `main` and `client/x-uat`: verdict `shared`, base `main`.
>
> Phase 1 traces the save path: one array expands the toggle into event names; the read-back helper matches by prefix and needs no change. The acceptance criterion is the ticket's expected result.
>
> Phase 2 writes the brief: one array literal and two test expectations to change, nothing else; asks you to confirm scope and for a staging login.
>
> Phase 3 creates `fix/kyc-fourth-event` from `origin/main`. Phase 4's reviewer flags that a channel-count assertion elsewhere will now be off by one; it is fixed. Phase 5's QA agent saves the settings in the browser and shows the request payload carrying four names: PASS.
>
> Phase 6 reports the commit and waits. You say "push". The grant is written, the push goes through the pre-push suite, the PR is opened after you confirm. Phase 7 adds one trap to the profile: "channel-switch test counts KYC events; update it when the list changes (verified today)".

## Install

In Claude Code (CLI or desktop):

```
/plugin marketplace add GboyYouMam/asana-task-plugin
/plugin install asana-task@asana-task-plugin
```

Dependencies: the `superpowers` plugin is declared and installs automatically; the `ponytail` skill ships with the Anthropic skills collection. Both are optional: without them the pipeline applies a short set of fallback rules and says so.

First run: in any repository, type `/asana-task:asana-task` or paste an Asana link. The setup step detects `git`, `gh` (must be logged in), `node`, and optionally `orca` and `codex`, then writes the machine config. Enable the Asana connector in Claude's settings; the plugin reads tickets through it and ships no Asana credentials of its own. For browser QA, have the Playwright MCP server available; without it QA is reported as skipped.

## Your first repo

The first task in a repository starts with a profile draft. Read it, fix the base branch and the commands if the guess was wrong, and approve. If you already keep notes about the repository, import them instead:

```
node "<plugin root>/bin/asana-task-profile.js" import path/to/notes.md
```

## Without Claude Code

- **Codex**: copy `export/codex/skills/asana-task` into `~/.agents/skills/`. It is the same pipeline with the hook-dependent sentences removed.
- **Cursor**: Cursor reads Claude hooks from `.claude/settings.json`; `export/cursor/claude-hooks-snippet.json` is the guard as a user-level hook. Point its `args` at your plugin checkout.

`export/` is generated by `npm run build:export` from the canonical skill and checked in CI; never edit it by hand.

## Limits

- Whether plugin hooks run in the Claude Code desktop app is not yet verified; without hooks the skill text still states every rule, but nothing enforces it.
- Asana access is only through the user's own connector.
- Windows is the first-class target; macOS and Linux should work but are less exercised.
- The guard is scoped to active tasks by design: outside the pipeline it does nothing, so it cannot protect work you do without it.

## Development

```
npm test                 # node:test suite
npm run check:denylist   # fails if a word from ASANA_TASK_DENYLIST (a file outside the repo) appears anywhere
npm run build:export     # regenerate export/
claude plugin validate . --strict
```

MIT.
