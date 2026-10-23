#!/usr/bin/env node
// Records one push grant for the current repo and branch. Run only after the user explicitly asked to push.
import { repoKey } from "../lib/repo-key.js";
import { currentBranch } from "../lib/brief.js";
import { grantPush } from "../lib/grants.js";

const cwd = process.cwd();
const key = repoKey(cwd);
const branch = process.argv[2] ?? currentBranch(cwd);
if (!branch) {
  console.error("refusing: no branch (detached HEAD and none given)");
  process.exit(1);
}
grantPush(key, branch);
console.log(`push granted for ${key} ${branch}`);
