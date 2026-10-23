#!/usr/bin/env node
// Brief CLI: create --title <t> --ticket <url> [--branch <b>] | path [--branch <b>] | status "<line>" | remove [--branch <b>]
// A brief marks the pipeline as active for a repo and branch; the guard hook keys on it.
// It belongs to the task branch, never to the default base: create it once that branch exists.
import { repoKey } from "../lib/repo-key.js";
import { currentBranch, briefPath, createBrief, setBriefStatus, removeBrief, hasBrief } from "../lib/brief.js";
import { loadProfile, defaultBase } from "../lib/profile.js";

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const cwd = process.cwd();
const key = repoKey(cwd);
const branch = flag("--branch") ?? currentBranch(cwd);
if (!branch) {
  console.error("refusing: detached HEAD (check out a branch first, or pass --branch)");
  process.exit(1);
}

switch (command) {
  case "create": {
    const title = flag("--title");
    const ticketUrl = flag("--ticket");
    if (!title || !ticketUrl) {
      console.error("usage: asana-task-brief.js create --title <title> --ticket <url> [--branch <branch>]");
      process.exit(2);
    }
    const base = defaultBase(loadProfile(key));
    if (base && branch === base) {
      console.error(`refusing: ${base} is the default base; create the task branch first or pass --branch fix/<slug>`);
      process.exit(1);
    }
    if (hasBrief(key, branch)) {
      console.error(`refusing: a brief already exists for ${key} ${branch} (use status/remove)`);
      process.exit(1);
    }
    console.log(createBrief(key, branch, { title, ticketUrl }));
    break;
  }
  case "path":
    console.log(briefPath(key, branch));
    if (!hasBrief(key, branch)) process.exitCode = 1;
    break;
  case "status":
    if (!args[1]) {
      console.error('usage: asana-task-brief.js status "<one line>"');
      process.exit(2);
    }
    setBriefStatus(key, branch, args[1]);
    console.log(`status set for ${key} ${branch}`);
    break;
  case "remove":
    removeBrief(key, branch);
    console.log(`brief removed for ${key} ${branch}`);
    break;
  default:
    console.error('usage: asana-task-brief.js create --title <t> --ticket <url> [--branch <b>] | path | status "<line>" | remove');
    process.exit(2);
}
