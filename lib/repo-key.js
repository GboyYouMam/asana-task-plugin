import path from "node:path";
import { spawnSync } from "node:child_process";

/** Normalises an origin URL to `host/owner/name` (lowercase, no `.git`). Returns null when unparseable. */
export function repoKeyFromUrl(url) {
  const trimmed = url.trim();
  let host;
  let repoPath;
  const scp = trimmed.match(/^[^@]+@([^:]+):(.+)$/);
  const uri = trimmed.match(/^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
  if (scp) [, host, repoPath] = scp;
  else if (uri) [, host, repoPath] = uri;
  else return null;
  const clean = repoPath.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  return `${host}/${clean}`.toLowerCase();
}

/** `host/owner/name` from the origin remote, or `local/<dirname>` when there is none. */
export function repoKey(cwd) {
  const result = spawnSync("git", ["-C", cwd, "remote", "get-url", "origin"], { encoding: "utf8" });
  const fromUrl = result.status === 0 ? repoKeyFromUrl(result.stdout) : null;
  return fromUrl ?? `local/${path.basename(path.resolve(cwd)).toLowerCase()}`;
}

/** File-system safe form of a key: `/` becomes `__`. */
export function repoKeyDir(key) {
  return key.replace(/\//g, "__");
}

/** Repository root for cwd, or null outside a repository. */
export function repoRoot(cwd) {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}
