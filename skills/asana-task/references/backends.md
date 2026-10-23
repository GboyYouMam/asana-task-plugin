# Backends

The plugin config (`asana-task-setup.js`) names a worktree backend and a worker backend. The pipeline is the same; only these commands change.

## Worktree backends

### `git` (default)

```text
git fetch origin
git worktree add "<worktreeRoot>/<repo>/<slug>" -b fix/<slug> origin/<base>
cd "<worktreeRoot>/<repo>/<slug>" && <profile Commands: install>
```

Cleanup after the PR is merged: `git worktree remove "<worktreeRoot>/<repo>/<slug>"`; on Windows, if removal fails with "Filename too long", delete the folder and run `git worktree prune`.

### `orca`

```text
orca worktree create --repo <repo selector> --name <slug> --no-parent --base-branch origin/<base> --setup skip --json
git -C <path from JSON> branch -m fix/<slug>
```

- `--setup skip` is mandatory: Orca's own setup hook runs an install in a terminal, and a parallel install fails with ENOTEMPTY. If a worktree was created without it, wait for the setup terminal to go idle before installing.
- Resolve the repo selector at runtime (`orca repo list --json`, match by name); never store Orca ids in a profile.
- Verify the worktree survived the rename: `git worktree list | grep <slug>`. If Orca tore the folder down, the branch still exists: `git worktree add <path> fix/<slug>` from the main checkout, then install.
- Card bookkeeping: `orca worktree set --worktree path:<path> --workspace-status in-progress --comment "<ticket>: <one line>"`; move to `in-review` at Phase 6.

### `single-checkout` (per-repo `workspaceMode` in config)

For repos that cannot be cloned twice (large data, licensed tooling): branch in place. `git status --short` must be empty first; otherwise stop and ask the user what to do with the uncommitted changes.

## Worker backends

### `claude` (default)

Implement in this session, test-first, following the brief.

### `codex`

```text
codex exec -m <config.codexModel, default gpt-5.6-luna> -c 'model_reasoning_effort="<low|medium|high>"' -s workspace-write --skip-git-repo-check -C "<worktree>" - < "<brief path>"
```

Run in the background and review the diff in Phase 4 exactly as if a colleague wrote it. Codex may rewrite `package-lock.json` on install; restore it unless the brief planned a lockfile change. Small fixes (a few lines) are faster done directly by Claude; the browser/query QA in Phase 5 is mandatory either way.

## Dev servers

Pick a port from `config.devPortStart` upwards; check it is free first (`netstat -ano | findstr :<port>` on Windows, `lsof -i :<port>` elsewhere). Expect a long first compile on large front-ends; wait for the "compiled" line before QA. Stop the server when QA is done.
