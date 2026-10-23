import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir.js";
import { repoKeyDir } from "./repo-key.js";

export const SECTIONS = ["Repo", "Commands", "Routing", "QA", "Forbidden diffs", "Traps", "Deploy check"];
export const STALE_DAYS = 60;

const TRAP_RE = /^- (.+) \(verified: (\d{4}-\d{2}-\d{2})\)\s*$/;

/**
 * @typedef {{ text: string, verified: string }} Trap
 * @typedef {{ sections: Record<string, string>, traps: Trap[], order: string[] }} Profile
 */

/** @returns {Profile} */
export function parseProfile(md) {
  const sections = {};
  const order = [];
  let current = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      current = heading[1];
      if (!(current in sections)) {
        sections[current] = "";
        order.push(current);
      }
      continue;
    }
    if (current !== null) sections[current] += line + "\n";
  }
  const traps = [];
  if (sections.Traps) {
    for (const line of sections.Traps.split("\n")) {
      const m = line.match(TRAP_RE);
      if (m) traps.push({ text: m[1], verified: m[2] });
    }
  }
  return { sections, traps, order };
}

/** @param {Profile} profile */
export function serializeProfile(profile) {
  const names = [...profile.order];
  for (const name of SECTIONS) if (!names.includes(name) && name in profile.sections) names.push(name);
  if (!names.includes("Traps")) names.push("Traps");
  return names
    .map((name) => {
      const body = name === "Traps"
        ? profile.traps.map((t) => `- ${t.text} (verified: ${t.verified})`).join("\n") + "\n"
        : (profile.sections[name] ?? "").replace(/\s+$/, "") + "\n";
      return `## ${name}\n${body}`;
    })
    .join("\n");
}

export function profilePath(key) {
  return path.join(dataDir(), "profiles", `${repoKeyDir(key)}.md`);
}

/** @returns {Profile | null} */
export function loadProfile(key) {
  const file = profilePath(key);
  if (!fs.existsSync(file)) return null;
  return parseProfile(fs.readFileSync(file, "utf8"));
}

/** @param {Profile} profile */
export function saveProfile(key, profile) {
  const file = profilePath(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeProfile(profile));
}

/** Traps whose `verified` date is older than `days` relative to `today`. */
export function staleTraps(profile, today = new Date(), days = STALE_DAYS) {
  const cutoff = today.getTime() - days * 86400000;
  return profile.traps.filter((t) => new Date(t.verified).getTime() < cutoff);
}

/** Adds a trap (or refreshes its date when the text already exists). Returns the profile. */
export function upsertTrap(profile, text, verified) {
  const existing = profile.traps.find((t) => t.text === text);
  if (existing) existing.verified = verified;
  else profile.traps.push({ text, verified });
  return profile;
}
