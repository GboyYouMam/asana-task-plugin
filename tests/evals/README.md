# Acceptance checklist (manual, per release)

Mirrors §7 of the design spec. Run in a scratch git repository with the plugin installed from a local marketplace (`claude plugin marketplace add <checkout>`; `claude plugin install asana-task@asana-task-plugin`). Headless runs: `claude -p "<prompt>" --allowedTools "Bash,PowerShell,Read,Skill,Glob,Grep,<Asana tools>" --output-format stream-json --verbose`.

| # | Check | How | 0.1.0 result |
|---|---|---|---|
| 1 | Bare Asana link in a repo without a profile → skill triggers, machine setup runs, a profile draft is shown, pipeline stops for approval | `/asana-task:asana-task <url>` with a non-existent task id | PASS (setup ran; `no profile`; draft printed, not written; stopped at the unresolvable ticket) |
| 2 | Full task in a repo with a profile: Phases 0–6, QA by the `qa` agent, `git push` refused until the user says push | needs a real ticket and credentials | not run for 0.1.0 |
| 3 | `git add .` refused with a reason whenever a brief exists; allowed once the brief is removed | create a brief with `asana-task-brief.js`, then `git add .`, `git add <file>`, `git push`, remove the brief, `git add .` | PASS (`git add .` and `git push` blocked with the guard's reason; `git add a.txt` allowed; quiet after `remove`) |
| 4 | `superpowers` disabled → the skill still runs and names the fallback rules it applied | `claude plugin disable superpowers@claude-plugins-official`, run a task that reaches Phase 1 | not run end to end for 0.1.0 (fallback text verified by `tests/skill-text.test.js`) |
| 5 | Codex export loads as a skill and reads as the same pipeline without hook references | copy `export/codex/skills/asana-task` to `~/.agents/skills/`, open Codex | not run for 0.1.0 (export verified by `tests/build-export.test.js`: 7 hook-only lines stripped) |
| 6 | No company identifier anywhere in the repository | `ASANA_TASK_DENYLIST=<file> npm run check:denylist` | PASS on the maintainer's list |
| 7 | A new reader can restate the purpose and the seven phases from the README alone | ask a colleague | pending |

Cross-plugin skill invocation (design §3, unverified): no headless run reached Phase 1 for 0.1.0, so whether `superpowers:systematic-debugging` is actually invoked from inside the skill is still unknown. The README lists it under Limits.

Findings from the 0.1.0 runs that changed the code:
- On Windows the harness exposes a `PowerShell` tool, not `Bash`; the guard now matches both.
- `CLAUDE_PLUGIN_DATA` is not set for shell commands the model runs; the data root is now a fixed path so the hook and the scripts always agree.
- An unnamespaced personal skill with the same name wins the trigger; keep one.
