import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { repoKey, repoKeyFromUrl, repoKeyDir } from "../lib/repo-key.js";
import { parseProfile, serializeProfile, loadProfile, saveProfile, staleTraps } from "../lib/profile.js";
import { draftProfile } from "../lib/profile-draft.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asana-task-"));
}
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function initRepo(dir) {
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
}

beforeEach(() => {
  process.env.ASANA_TASK_DATA = tmpDir();
});

test("repoKeyFromUrl handles ssh and https origins", () => {
  assert.equal(repoKeyFromUrl("git@github.com:Owner/Example-App.git"), "github.com/owner/example-app");
  assert.equal(repoKeyFromUrl("https://github.com/owner/example-app"), "github.com/owner/example-app");
  assert.equal(repoKeyFromUrl("ssh://git@github.com/owner/example-app.git"), "github.com/owner/example-app");
});

test("repoKey without origin uses local/<dirname>", () => {
  const dir = path.join(tmpDir(), "my-app");
  fs.mkdirSync(dir);
  initRepo(dir);
  assert.equal(repoKey(dir), "local/my-app");
});

test("repoKeyDir replaces path separators", () => {
  assert.equal(repoKeyDir("github.com/owner/example-app"), "github.com__owner__example-app");
});

test("parseProfile reads fixed sections and dated traps, keeps unknown sections", () => {
  const md = "## Repo\nbase: main\n\n## Traps\n- npm ci fails on 1.x (verified: 2026-01-01)\n\n## Notes\nkeep me\n";
  const p = parseProfile(md);
  assert.equal(p.sections.Repo.trim(), "base: main");
  assert.deepEqual(p.traps, [{ text: "npm ci fails on 1.x", verified: "2026-01-01" }]);
  assert.equal(p.sections.Notes.trim(), "keep me");
  const out = serializeProfile(p);
  assert.ok(out.includes("## Notes"));
  assert.ok(out.includes("- npm ci fails on 1.x (verified: 2026-01-01)"));
});

test("saveProfile then loadProfile round-trips by repo key", () => {
  const p = parseProfile("## Repo\nbase: main\n");
  saveProfile("github.com/owner/example-app", p);
  assert.equal(loadProfile("github.com/owner/example-app").sections.Repo.trim(), "base: main");
  assert.equal(loadProfile("github.com/owner/missing"), null);
});

test("staleTraps returns traps older than 60 days", () => {
  const p = parseProfile("## Traps\n- old (verified: 2026-01-01)\n- fresh (verified: 2026-03-01)\n");
  const stale = staleTraps(p, new Date("2026-03-10"));
  assert.deepEqual(stale.map((t) => t.text), ["old"]);
});

test("draftProfile fills Commands from package.json scripts and Repo from branches", () => {
  const dir = tmpDir();
  initRepo(dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "jest", typecheck: "tsc" }, dependencies: { react: "18" } }));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# agents\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  git(dir, "branch", "client/x-uat");
  git(dir, "branch", "client/y-uat");
  const p = draftProfile(dir);
  assert.match(p.sections.Commands, /test: npm test/);
  assert.match(p.sections.Commands, /typecheck: npm run typecheck/);
  assert.match(p.sections.Repo, /default base: main/);
  assert.match(p.sections.Repo, /client branches: client\/<name>-uat/);
  assert.match(p.sections.QA, /browser/);
  assert.match(p.sections.Routing, /AGENTS\.md/);
  assert.deepEqual(p.traps, []);
});
