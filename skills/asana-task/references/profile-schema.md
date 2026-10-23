# Repo profile

A profile is the plugin's memory about one repository, for one user. It lives outside the repository, in the plugin data directory:

```
<data>/profiles/<host>__<owner>__<name>.md      e.g. github.com__acme__example-app.md
```

`<data>` is `~/.claude/asana-task-data` (override with `ASANA_TASK_DATA`). A repository without an `origin` remote is keyed `local__<dirname>`.

It is never committed to the repository it describes. Colleagues each grow their own.

## Sections

Markdown with exactly these H2 headings. Unknown headings are kept but ignored by the tooling.

| Section | What goes there |
|---|---|
| `Repo` | default base branch; client/feature branch pattern and how the ticket's client field maps to it; prod-vs-uat rule |
| `Commands` | one per line, `label: command` — `install`, `typecheck`, `lint`, `test`, `dev server` |
| `Routing` | where code-path documentation lives (`AGENTS.md`, `docs/agent-routing.md`, …) |
| `QA` | `browser`, `query-path` or `cli`, followed by how to reach the app or the query path |
| `Forbidden diffs` | paths that must be unchanged at commit time, one per line |
| `Traps` | one line each: `- <text> (verified: YYYY-MM-DD)` |
| `Deploy check` | how to tell whether a base branch is deployed (workflow name, URL, command) |

## Example (generic)

```markdown
## Repo
default base: main
client branches: client/<name>-uat (map the ticket's client field to <name>)
prod branches are promoted by release; never target client/<name> directly

## Commands
install: npm ci
typecheck: npm run typecheck
lint: npm run lint
test: npm test
dev server: PORT=<free> npm start

## Routing
read AGENTS.md first
code path → docs: docs/agent-routing.md

## QA
browser
dev server on http://localhost:<port>; log in with the credentials the user gives in the conversation

## Forbidden diffs
package-lock.json
src/config/env.ts

## Traps
- npm ci fails with EUSAGE on 1.x branches: run npm install, then git checkout -- package-lock.json (verified: 2026-01-15)
- pre-push suite takes ~8 min; push with ssh ServerAliveInterval=20 (verified: 2026-01-15)

## Deploy check
gh run list --branch <base> --workflow deploy.yml
```

## Lifecycle

- **Draft.** `asana-task-profile.js draft` builds a first version from `package.json`, git hooks, branch names and `AGENTS.md`/`CLAUDE.md`. It is printed, not written; the pipeline writes it only after the user approves.
- **Import.** `asana-task-profile.js import <file>` stores an existing notes file as the profile for the current repository.
- **Growth.** Phase 7 of the pipeline writes new traps, corrected commands and branch facts into the profile with today's `verified` date, and the task report lists every change.
- **Ageing.** A trap older than 60 days is re-verified cheaply (run the command, check the branch exists) before it is trusted; the date is refreshed or the line removed. `asana-task-profile.js stale` lists them.
- **Precedence.** user profile > optional repo seed (`.agent/pipeline.md`, if a repo happens to ship one) > machine config > plugin defaults.
