#!/usr/bin/env node
// Brief CLI: create --title <t> --ticket <url> | path | status "<line>" | remove
// A brief marks the pipeline as active for the current repo and branch; the guard hook keys on it.
import { repoKey } from "../lib/repo-key.js";
import { currentBranch, briefPath, createBrief, setBriefStatus, removeBrief, hasBrief } from "../lib/brief.js";

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const cwd = process.cwd();
const key = repoKey(cwd);
const branch = currentBranch(cwd);
if (!branch) {
  console.error("refusing: detached HEAD (check out a branch first)");
  process.exit(1);
}

switch (command) {
  case "create": {
    const title = flag("--title");
    const ticketUrl = flag("--ticket");
    if (!title || !ticketUrl) {
      console.error("usage: asana-task-brief.js create --title <title> --ticket <url>");
      process.exit(2);
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
    console.error('usage: asana-task-brief.js create --title <t> --ticket <url> | path | status "<line>" | remove');
    process.exit(2);
}
