import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../lib/guard-rules.js";

const base = { tool_name: "Bash", cwd: "/r" };
const active = { active: true, branch: "fix/x", hasGrant: () => false, forbidden: [], stagedPaths: () => [], stagedDiff: () => "" };
const granted = { ...active, hasGrant: () => true };
const cmd = (command) => ({ ...base, tool_input: { command } });

test("inactive pipeline allows everything", () => {
  assert.equal(evaluate(cmd("git add ."), { ...active, active: false }).kind, "allow");
  assert.equal(evaluate(cmd("git push --force"), { ...active, active: false }).kind, "allow");
});

test("blocks git add . / -A / --all, also with -C and after cd", () => {
  for (const c of ["git add .", "git add -A", "git add --all", "git -C x add .", "cd y && git add ."]) {
    assert.equal(evaluate(cmd(c), active).kind, "block", c);
  }
});

test("blocks the other stage-everything spellings", () => {
  for (const c of ["git add ./", "git add *", "git add -u", "git add --update", "git add :/"]) {
    assert.equal(evaluate(cmd(c), active).kind, "block", c);
  }
});

test("allows git add with explicit paths", () => {
  assert.equal(evaluate(cmd("git add src/a.js tests/a.test.js"), active).kind, "allow");
});

test("does not block git add . inside a quoted string", () => {
  assert.equal(evaluate(cmd('echo "git add ."'), active).kind, "allow");
  assert.equal(evaluate(cmd('git commit -m "never run git add . here"'), active).kind, "allow");
});

test("PowerShell call shapes and git.exe are still recognised", () => {
  const shapes = [
    "& git add .",
    "git.exe add .",
    "Write-Output (git add .)",
    "if ($?) { git add . }",
    "$(git add .)",
    'cmd /c "git add ."',
    'git add .; "EXIT CODE: $LASTEXITCODE"',
  ];
  for (const c of shapes) assert.equal(evaluate(cmd(c), active).kind, "block", c);
});

test("blocks git push without grant", () => {
  const d = evaluate(cmd("git push -u origin fix/x"), active);
  assert.equal(d.kind, "block");
  assert.match(d.reason, /ask the user/i);
});

test("allows git push with a grant and reports that the grant is needed", () => {
  const d = evaluate(cmd("git push -u origin fix/x"), granted);
  assert.equal(d.kind, "allow");
  assert.equal(d.needsGrant, true);
  assert.equal(evaluate(cmd("git status"), granted).needsGrant, undefined);
});

test("a blocked segment after a push keeps the whole command blocked", () => {
  assert.equal(evaluate(cmd("git push origin fix/x; git push --force"), granted).kind, "block");
});

test("push to another branch than the granted one is blocked", () => {
  assert.equal(evaluate(cmd("git push origin other"), granted).kind, "block");
  assert.equal(evaluate(cmd("git push origin fix/x:fix/x"), granted).kind, "allow");
  assert.equal(evaluate(cmd("git push origin HEAD"), granted).kind, "allow");
  assert.equal(evaluate(cmd("git push"), granted).kind, "allow");
  assert.equal(evaluate(cmd("git push -u origin fix/x"), granted).kind, "allow");
});

test("always blocks force push and --no-verify even with a grant", () => {
  for (const c of ["git push --force", "git push -f", "git push --force-with-lease", "git push origin +main", "git push --no-verify"]) {
    assert.equal(evaluate(cmd(c), granted).kind, "block", c);
  }
});

test("git push -n is a dry run and is allowed with a grant", () => {
  assert.equal(evaluate(cmd("git push -n origin fix/x"), granted).kind, "allow");
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
