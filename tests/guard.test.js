import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../lib/guard-rules.js";

const base = { tool_name: "Bash", cwd: "/r" };
const active = { active: true, grant: () => false, forbidden: [], stagedPaths: () => [], stagedDiff: () => "" };
const cmd = (command) => ({ ...base, tool_input: { command } });

test("inactive pipeline allows everything", () => {
  assert.equal(evaluate(cmd("git add ."), { ...active, active: false }).kind, "allow");
  assert.equal(evaluate(cmd("git push --force"), { ...active, active: false }).kind, "allow");
});

test("blocks git add . / -A / --all, also with -C", () => {
  for (const c of ["git add .", "git add -A", "git add --all", "git -C x add .", "cd y && git add ."]) {
    assert.equal(evaluate(cmd(c), active).kind, "block", c);
  }
});

test("allows git add with explicit paths", () => {
  assert.equal(evaluate(cmd("git add src/a.js tests/a.test.js"), active).kind, "allow");
});

test("does not block git add . inside a quoted string", () => {
  assert.equal(evaluate(cmd('echo "git add ."'), active).kind, "allow");
});

test("blocks git push without grant", () => {
  const d = evaluate(cmd("git push -u origin x"), active);
  assert.equal(d.kind, "block");
  assert.match(d.reason, /ask the user/i);
});

test("allows git push with a grant and consumes it once", () => {
  let used = 0;
  const g = { ...active, grant: () => { used++; return true; } };
  assert.equal(evaluate(cmd("git push -u origin x"), g).kind, "allow");
  assert.equal(used, 1);
});

test("always blocks force push and --no-verify even with a grant", () => {
  const g = { ...active, grant: () => true };
  for (const c of ["git push --force", "git push -f", "git push --force-with-lease", "git push origin +main", "git push --no-verify", "git push -n"]) {
    assert.equal(evaluate(cmd(c), g).kind, "block", c);
  }
});

test("asks on gh pr create / gh pr comment", () => {
  for (const c of ["gh pr create --base main", "gh pr comment 1 --body x"]) {
    assert.equal(evaluate(cmd(c), active).kind, "ask", c);
  }
});

test("asks on an Asana add_comment MCP tool", () => {
  const d = evaluate({ tool_name: "mcp__claude_ai_Asana_v2__add_comment", tool_input: {}, cwd: "/r" }, active);
  assert.equal(d.kind, "ask");
});

test("warns on commit with [DBG, package-lock.json or forbidden path staged", () => {
  const ctx = { ...active, forbidden: ["src/config/env.ts"], stagedPaths: () => ["package-lock.json", "src/config/env.ts"], stagedDiff: () => "+console.log('[DBG x')" };
  const d = evaluate(cmd("git commit -m x"), ctx);
  assert.equal(d.kind, "warn");
  assert.match(d.context, /package-lock\.json/);
  assert.match(d.context, /src\/config\/env\.ts/);
  assert.match(d.context, /\[DBG/);
});

test("clean commit is allowed", () => {
  assert.equal(evaluate(cmd("git commit -m x"), { ...active, stagedPaths: () => ["src/a.js"] }).kind, "allow");
});

test("warns on npm ci --no-package-lock and repo-wide formatters", () => {
  for (const c of ["npm ci --no-package-lock", "npx prettier --write .", "npx eslint --fix ."]) {
    assert.equal(evaluate(cmd(c), active).kind, "warn", c);
  }
});

test("PowerShell tool commands are guarded like Bash", () => {
  const d = evaluate({ tool_name: "PowerShell", tool_input: { command: "git add ." }, cwd: "/r" }, active);
  assert.equal(d.kind, "block");
});
