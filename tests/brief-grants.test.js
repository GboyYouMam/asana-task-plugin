import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { currentBranch, briefPath, createBrief, hasBrief, setBriefStatus } from "../lib/brief.js";
import { grantPath, grantPush, consumePush } from "../lib/grants.js";

const BIN = path.resolve("bin/asana-task-brief.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-"));
}
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function initRepo() {
  const dir = tmpDir();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "a.txt"), "a");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

beforeEach(() => {
  process.env.ASANA_TASK_DATA = tmpDir();
});

test("createBrief writes the skeleton and hasBrief becomes true", () => {
  const file = createBrief("github.com/o/r", "fix/task", { title: "Fix thing", ticketUrl: "https://app.asana.com/0/0/1/f" });
  assert.equal(file, briefPath("github.com/o/r", "fix/task"));
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /^# Fix thing\n/);
  assert.match(text, /Ticket: https:\/\/app\.asana\.com\/0\/0\/1\/f/);
  for (const h of ["## Status", "## Acceptance criteria", "## Files to change", "## Files that must not change", "## Tests affected", "## Verify", "## QA", "## Profile changes"]) {
    assert.ok(text.includes(h), h);
  }
  assert.equal(hasBrief("github.com/o/r", "fix/task"), true);
  assert.equal(hasBrief("github.com/o/r", "main"), false);
});

test("branch names with slashes map to __ in brief and grant paths", () => {
  assert.ok(briefPath("github.com/o/r", "fix/a/b").endsWith(path.join("github.com__o__r", "fix__a__b.md")));
  assert.ok(grantPath("github.com/o/r", "fix/a/b").endsWith(path.join("github.com__o__r", "fix__a__b.push")));
});

test("setBriefStatus rewrites only the Status section", () => {
  const file = createBrief("github.com/o/r", "fix/task", { title: "T", ticketUrl: "u" });
  setBriefStatus("github.com/o/r", "fix/task", "implemented, awaiting QA");
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /## Status\nimplemented, awaiting QA\n\n## Acceptance criteria/);
});

test("currentBranch returns the branch, and null on detached HEAD", () => {
  const dir = initRepo();
  assert.equal(currentBranch(dir), "main");
  git(dir, "checkout", "-q", "--detach");
  assert.equal(currentBranch(dir), null);
});

test("asana-task-brief create refuses on detached HEAD", () => {
  const dir = initRepo();
  git(dir, "checkout", "-q", "--detach");
  const r = spawnSync("node", [BIN, "create", "--title", "T", "--ticket", "u"], { cwd: dir, encoding: "utf8", env: process.env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing: detached HEAD/);
});

test("grantPush then consumePush is true once, then false", () => {
  grantPush("github.com/o/r", "fix/task");
  assert.equal(consumePush("github.com/o/r", "fix/task"), true);
  assert.equal(consumePush("github.com/o/r", "fix/task"), false);
});
