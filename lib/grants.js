import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir.js";
import { repoKeyDir } from "./repo-key.js";
import { branchFile } from "./brief.js";

export function grantPath(key, branch) {
  return path.join(dataDir(), "grants", repoKeyDir(key), `${branchFile(branch)}.push`);
}

/** Records that the user allowed exactly one push of this branch. */
export function grantPush(key, branch) {
  const file = grantPath(key, branch);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, new Date().toISOString() + "\n");
}

export function hasGrant(key, branch) {
  return fs.existsSync(grantPath(key, branch));
}

/** Consumes the grant. True when one existed. */
export function consumePush(key, branch) {
  const file = grantPath(key, branch);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}
