#!/usr/bin/env node
// Profile CLI: show | draft | write | import <file> | stale
// The profile is this user's memory about the repository at cwd; see references/profile-schema.md.
import fs from "node:fs";
import { repoKey } from "../lib/repo-key.js";
import { parseProfile, serializeProfile, loadProfile, saveProfile, staleTraps, profilePath } from "../lib/profile.js";
import { draftProfile } from "../lib/profile-draft.js";

const [command, arg] = process.argv.slice(2);
const key = repoKey(process.cwd());

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

switch (command) {
  case "show": {
    const profile = loadProfile(key);
    if (!profile) {
      console.log(`no profile for ${key}`);
      process.exitCode = 1;
      break;
    }
    console.log(`profile: ${profilePath(key)}`);
    process.stdout.write(serializeProfile(profile));
    break;
  }
  case "draft":
    process.stdout.write(serializeProfile(draftProfile(process.cwd())));
    break;
  case "write":
    saveProfile(key, parseProfile(readStdin()));
    console.log(`profile written: ${profilePath(key)}`);
    break;
  case "import": {
    if (!arg) {
      console.error("usage: asana-task-profile.js import <file>");
      process.exitCode = 2;
      break;
    }
    saveProfile(key, parseProfile(fs.readFileSync(arg, "utf8")));
    console.log(`profile imported for ${key}: ${profilePath(key)}`);
    break;
  }
  case "stale": {
    const profile = loadProfile(key);
    if (!profile) break;
    for (const t of staleTraps(profile)) console.log(`${t.verified} ${t.text}`);
    break;
  }
  default:
    console.error("usage: asana-task-profile.js show | draft | write | import <file> | stale");
    process.exitCode = 2;
}
