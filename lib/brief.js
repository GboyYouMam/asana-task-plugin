import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { dataDir } from "./data-dir.js";
import { repoKeyDir } from "./repo-key.js";

const SKELETON = [
  "## Status",
  "## Acceptance criteria",
  "## Files to change",
  "## Files that must not change",
  "## Tests affected",
  "## Verify",
  "## QA",
  "## Profile changes",
];

export function branchFile(branch) {
  return branch.replace(/\//g, "__");
}

/** Current branch name, or null on detached HEAD / outside a repository. */
export function currentBranch(cwd) {
  const r = spawnSync("git", ["-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"], { encoding: "utf8" });
  const name = r.status === 0 ? r.stdout.trim() : "";
  return name || null;
}

export function briefPath(key, branch) {
  return path.join(dataDir(), "briefs", repoKeyDir(key), `${branchFile(branch)}.md`);
}

export function hasBrief(key, branch) {
  return fs.existsSync(briefPath(key, branch));
}

/** Writes the brief skeleton and returns its path. */
export function createBrief(key, branch, { title, ticketUrl }) {
  const file = briefPath(key, branch);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [`# ${title}`, `Ticket: ${ticketUrl}`, "", ...SKELETON.map((h) => `${h}\n`)].join("\n");
  fs.writeFileSync(file, body);
  return file;
}

/** Replaces the body of `## Status` with one line; other sections are untouched. */
export function setBriefStatus(key, branch, status) {
  const file = briefPath(key, branch);
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const updated = text.replace(/## Status\n[\s\S]*?(?=\n## |$)/, `## Status\n${status}\n`);
  fs.writeFileSync(file, updated);
}

export function removeBrief(key, branch) {
  fs.rmSync(briefPath(key, branch), { force: true });
}
