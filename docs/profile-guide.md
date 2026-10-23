# Profile guide

A profile is what the plugin knows about one repository, for you. It is yours: it lives outside the repository, nobody else sees it, and the pipeline keeps it current.

## Where it lives

```
~/.claude/asana-task-data/profiles/<host>__<owner>__<name>.md
```

The root can be overridden with `ASANA_TASK_DATA`. A repository without an `origin` remote is keyed `local__<folder name>`. To see the path for the repository you are in:

```
node "<plugin root>/bin/asana-task-profile.js" show
```

## The seven sections

| Section | What goes there | Example |
|---|---|---|
| `Repo` | default base; client/feature branch pattern and how the ticket's client field maps to it; prod-vs-uat rule | `default base: main` / `client branches: client/<name>-uat` |
| `Commands` | `label: command`, one per line: `install`, `typecheck`, `lint`, `test`, `dev server` | `typecheck: npm run typecheck` |
| `Routing` | where code-path docs live | `read AGENTS.md first` |
| `QA` | `browser`, `query-path` or `cli`, then how to reach the target | `browser` + the dev server URL |
| `Forbidden diffs` | paths that must be unchanged at commit time | `package-lock.json` |
| `Traps` | `- <text> (verified: YYYY-MM-DD)` | `- pre-push suite takes ~8 min (verified: 2026-01-15)` |
| `Deploy check` | how to tell a base branch is deployed | `gh run list --branch <base> --workflow deploy.yml` |

Unknown headings are preserved but ignored by the tooling, so you can keep notes of your own in the same file.

## How it starts

The first task in a repository runs `draft`, which looks at `package.json` scripts and dependencies, git hooks, branch names and `AGENTS.md`/`CLAUDE.md`, and prints a best-effort profile. Read it before approving: branch conventions are guessed from names, and the `QA` method is guessed from dependencies. Correct what is wrong; the pipeline writes it with `write`.

If you already have notes, import them as the profile instead; only the seven headings above are read by the tooling:

```
node "<plugin root>/bin/asana-task-profile.js" import path/to/notes.md
```

## How it grows

Phase 7 of every task writes what the task taught into the profile: a trap with today's date, a corrected command, a branch fact. The task report lists each change so you can veto it. You can also edit the file by hand at any time.

## How it stays honest

- A trap older than 60 days is re-verified before it is trusted (the command is run, the branch is checked); the date is refreshed or the line removed. `stale` lists them.
- Commands are probed at the start of Phase 3; a command that does not exist is reported, not executed.
- Keep machine-specific values out of the profile (ports, absolute paths, tool ids): those belong in the plugin config, and the profile is about the repository.

## Optional repo seed

If a repository happens to ship `.agent/pipeline.md` in the same format, the pipeline reads it first and your profile overrides it. The plugin never creates or requires that file.
