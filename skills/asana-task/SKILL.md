---
name: asana-task
description: Use when the user gives an Asana task link (app.asana.com/...) and wants it worked on, investigated, or delivered — "/asana-task:asana-task <url>", "take this task", "investigate", "analyse", "look at this ticket", or a bare Asana URL with a short instruction. Drives one ticket from link to reviewed, QA'd branch and PR, with the user deciding scope and when to push.
---

# Asana Task Pipeline

One Asana link in → a reviewed, QA'd commit and PR out (one per repo and base branch touched). The user decides scope and when to push; everything else is this pipeline's job.

Everything repo-specific comes from the **profile** (`references/profile-schema.md`), a per-user file the plugin keeps outside the repository. Everything machine-specific comes from the plugin config written by `asana-task-setup.js`. This skill itself knows no repository.

Scripts live in the plugin: run them as `node "${CLAUDE_PLUGIN_ROOT}/bin/<script>"` from the repository root. The task's working state is a **brief**, a file keyed to the repo and the task branch.<!-- hooks-only --> While a brief exists for the current repo and branch, the plugin's guard hook enforces the rules marked "the guard" below.<!-- /hooks-only -->

## Phase 0 — Read the task and route it

1. **Machine config.** Run `asana-task-setup.js` once per machine. If it reports a blocker (no `gh` login, no git), stop and relay the exact line to the user.
2. **Profile.** Run `asana-task-profile.js show`. If it prints `no profile for <key>`, run `asana-task-profile.js draft`, show the draft to the user, correct it with them, and save it by piping the final text into `asana-task-profile.js write`. Do not continue without a profile: every later phase reads it. If the profile has traps older than 60 days (`asana-task-profile.js stale`), re-verify each cheaply before relying on it.
3. **Ticket.** Read the task with the Asana MCP tools (task, stories, attachments). Download screenshots to the scratchpad and read them. Extract: expected result (acceptance criteria), out-of-scope "related" questions, the client field, the impact field, the product field. A subtask with empty fields inherits from its parent task: read the parent.
4. **Route to a repo** using the profile's `Repo` and `Routing` sections and the ticket's product/symptoms. Follow the data, not the title: a UI ticket whose screenshots show a wrong API response is a backend task. When symptoms span two repos, plan two PRs. If the route is still unclear after reading, ask.
5. **Candidate base branch.** Default base from the profile when the impact field says main or there is no client; the client branch per the profile's pattern when the ticket is client-only. This is a candidate: step 7 decides. Never create a branch before step 7.
   `<slug>` throughout is a short kebab-case slug from the title, never the ticket id.
6. **Reopened task** (comments already contain a PR link, "merged", or a QA "still reproducible"): `gh pr view <n> --json state,mergedAt,baseRefName,mergeCommit,files` and `gh pr diff <n>`; confirm with the profile's `Deploy check` that the merge was deployed **before** the QA comment. If not, QA tested stale code: say so and stop. Compare the QA screenshots with the originals and decide: fix insufficient, different scenario, or cache. New work starts from the current base; never revert the first PR silently.
7. **Scout.** Dispatch the `asana-task:scout` agent with: ticket id, 2–3 title keywords, suspect files, base candidates, the client branch if any. It answers "already fixed?" (PRs by id and keywords, commits on suspect files since the ticket was created, the same bug fixed on another branch) and "client vs main" (`client-only` | `shared` | `already-fixed-on-main`). A merged PR carrying the ticket link means the code is done: report PR, author, deploy status and what is left; do not re-implement. `shared` moves the fix to the default base regardless of the ticket's field; `already-fixed-on-main` means cherry-pick, not re-implement. Default when unsure: shared.
8. **Investigate-only request** ("analyse", "explain", "investigate", "answer the question"): report findings and STOP. No brief, no branch, no fix.

## Phase 1 — Investigate

REQUIRED SUB-SKILL: `superpowers:systematic-debugging` for bugs. If unavailable, apply `references/fallback-rules.md` §1.

- Resolve the code path with the profile's `Routing`. Read only what it points to.
- Trace the real flow end to end (entry point → service → storage → consumer). Grep every caller of what you will change.
- When the symptom is "data shows X here and Y there", find both producers and compare their definitions before touching either.
- If the ticket only has "Expected result", that IS the acceptance criteria. Say so.
- Temporary instrumentation is allowed; tag every line `[DBG` so it is greppable. It must be gone before commit.<!-- hooks-only --> The guard warns when a staged diff still carries it.<!-- /hooks-only -->
- A fix that rests on a production fact you cannot verify locally is reported as a hypothesis with the exact query that confirms it.

## Phase 2 — Plan

REQUIRED SUB-SKILL: `ponytail` (laziest correct solution). If unavailable, apply `references/fallback-rules.md` §2.

Draft the plan now; it becomes the brief once the task branch exists in Phase 3. It contains:
- Acceptance criteria, numbered, nothing beyond the expected result.
- Exact files/lines to change; files that must NOT change and why (the callers found in Phase 1).
- Existing tests that will break and how to adjust them.
- Verify commands from the profile's `Commands`.
- Never put credentials in the brief, the worktree, or a commit.

Before implementation starts, confirm scope with the user **and** ask for any QA credentials now, so Phase 5 never blocks on them.

## Phase 3 — Workspace and implementation

Read `references/backends.md` and use the worktree backend and worker backend from the plugin config.

- Branch naming is mandatory: `fix/<slug>` or `feat/<slug>`, never a `<user>/...` prefix. Rename with `git branch -m` before committing if needed.
- Check the branch really sits on the base (`git merge-base --is-ancestor origin/<base> HEAD`); if stale and without own commits, `git reset --hard origin/<base>` and reinstall dependencies.
- Never work on a detached HEAD or directly on the base branch.
- **Create the brief as soon as the task branch exists**, from inside the worktree: `asana-task-brief.js create --title "<title>" --ticket "<permalink>"` (or `--branch fix/<slug>` when run from elsewhere). The script refuses the profile's default base on purpose: a brief belongs to the task branch only. Then fill its sections with the Phase 2 plan.
- Probe the profile's `Commands` once (`--version`/`--help`); a command that does not exist is reported, not run blindly.

## Phase 4 — Review

REQUIRED SUB-SKILL: `superpowers:requesting-code-review` mindset. If unavailable, apply `references/fallback-rules.md` §3.

- Dispatch the `asana-task:reviewer` agent with the brief path and `git diff origin/<base>`. It gets no implementation transcript on purpose.
- Check the diff against the brief yourself too: scope, callers, conventions, English-only comments, no unplanned files.
- `git checkout -- package-lock.json` if it was touched and the brief did not plan it.
- Drop verification-only files. Fix style issues yourself; do not send a worker back for one-liners.
- `git diff | grep -n "DBG"` must print nothing. Paths under the profile's `Forbidden diffs` must be unchanged.

## Phase 5 — QA

Static checks (tests, lint, typecheck) are NOT the QA. QA means exercising the change the way the reporter would see it, by the method in the profile's `QA` section:

- `browser`: the real app, driven through the Playwright MCP tools. If no browser tools are available, write `QA: skipped: no browser` in the brief and say so in the report; do not pretend.
- `query-path`: the real query path (GraphQL/REST call with a real token against a local or dev instance) plus SQL on the tables the change writes.
- `cli`: the command the user would run, with its real output.

Dispatch the `asana-task:qa` agent with: the acceptance criteria, how to reach the target, the credentials the user gave (prompt only, never files), the changed-file scope, the QA method. Require a PASS/FAIL verdict per criterion with evidence, plus one regression pass over adjacent behaviour. Stop any dev server you started.

## Phase 6 — Commit, hand over, then push on request

REQUIRED SUB-SKILL: `superpowers:verification-before-completion`. If unavailable, apply `references/fallback-rules.md` §4.

- Conventional Commit: `fix(<scope>): <present tense>` + bullets + the `Co-Authored-By` line the session's attribution reminder gives. If the user dictates a title, use it verbatim.
- `git add` **explicit paths only**, never `git add .`, `-A` or `-u`.<!-- hooks-only --> The guard blocks those inside a task.<!-- /hooks-only -->
- Report to the user: branch, commit, what changed, review findings and what you did with them, QA verdicts, out-of-scope observations, and the production steps the code alone does not cover (backfills, cache/flag resets, cherry-picks, follow-ups).
- **Do not push until the user says so.** Never force-push; never `--no-verify` unless the pre-push hook printed success and the push itself still failed.<!-- hooks-only --> When the user says push, run `asana-task-allow-push.js` (one grant = one push of this branch; "push both" = one grant per branch) and then push. The guard refuses a push without a grant, a push of another branch, and always refuses force-push and `--no-verify`.<!-- /hooks-only -->
- Push with keep-alive when the pre-push suite is long: `git -c core.sshCommand="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=60" push -u origin <branch>`; confirm with `git ls-remote --heads origin <branch>`.
- PR: `gh pr create --base <base> --head <branch> --title "<commit title>" --body "<ticket permalink>"`. Body = ticket link only (plus the session's attribution footer if one is given). Open the PR and post comments only when the user asked.<!-- hooks-only --> The guard asks for confirmation before `gh pr create` and before any Asana comment.<!-- /hooks-only -->
- One PR per (repo, base branch). A shared fix that must land on both the default base and a client branch is two PRs, or one PR plus a cherry-pick after merge: the profile's `Repo` section says which.
- Never rewrite pushed history without an explicit request.

## Phase 7 — Checkpoint (every task, including "already fixed" and "investigate only")

- `asana-task-brief.js status "<one line>"`: rewrite, don't append. A fresh session must read one truth.
- Repo knowledge learned in this task (a trap, a corrected command, a branch fact) goes into the profile now: read it with `show`, edit, write it back with `write`, with today's date on new traps. List every profile change in the final report so the user can veto.
- Cross-repo, personal lessons go to your memory, not the profile.
- When the task is fully delivered (PR merged or user says done), `asana-task-brief.js remove`.<!-- hooks-only --> The guard goes quiet on that branch once the brief is gone.<!-- /hooks-only -->

## Asana comments

Short, English, 2–4 lines: what was done, what is left, where it is merged. No preamble, no option essays unless asked. Posting is an outward action: only when the user asks.

## Red flags — you are drifting

- Widening scope to "related" items the ticket left open: list them for the user instead.
- Fixing a client branch without having checked whether the default base has the same bug.
- Starting Phase 1 without a profile for the repo.
- Committing `package-lock.json`, a verification-only file, a `[DBG` line, or a forbidden path.
- Claiming QA passed from static checks alone.
- Pushing, opening a PR, or commenting before the user asked.
- Reusing the main checkout instead of a fresh branch from the base.
- Running a repo-wide formatter or `git add .`.
