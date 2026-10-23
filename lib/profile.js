import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir.js";
import { repoKeyDir } from "./repo-key.js";

export const SECTIONS = ["Repo", "Commands", "Routing", "QA", "Forbidden diffs", "Traps", "Deploy check"];
export const STALE_DAYS = 60;

const TRAP_RE = /^- (.+) \(verified: (\d{4}-\d{2}-\d{2})\)\s*$/;

/**
 * @typedef {{ text: string, verified: string }} Trap
 * @typedef {{ preamble: string, sections: Record<string, string>, traps: Trap[], trapsExtra: string[], order: string[] }} Profile
 * `trapsExtra` keeps every Traps line that is not a dated trap, so hand-written notes are never lost.
 */

/** @returns {Profile} */
export function parseProfile(md) {
  const sections = {};
  const order = [];
  let preamble = "";
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
    if (current === null) preamble += line + "\n";
    else sections[current] += line + "\n";
  }
  const traps = [];
  const trapsExtra = [];
  if (sections.Traps) {
    for (const line of sections.Traps.replace(/\s+$/, "").split("\n")) {
      const m = line.match(TRAP_RE);
      if (m) traps.push({ text: m[1], verified: m[2] });
      else if (line.trim()) trapsExtra.push(line);
    }
  }
  return { preamble: preamble.replace(/\s+$/, ""), sections, traps, trapsExtra, order };
}

/** @param {Profile} profile */
export function serializeProfile(profile) {
  const names = [...profile.order];
  for (const name of SECTIONS) if (!names.includes(name) && name in profile.sections) names.push(name);
  if (!names.includes("Traps")) names.push("Traps");
  const body = names
    .map((name) => {
      const content = name === "Traps"
        ? [...profile.traps.map((t) => `- ${t.text} (verified: ${t.verified})`), ...(profile.trapsExtra ?? [])].join("\n") + "\n"
        : (profile.sections[name] ?? "").replace(/\s+$/, "") + "\n";
      return `## ${name}\n${content}`;
    })
    .join("\n");
  return profile.preamble ? `${profile.preamble}\n\n${body}` : body;
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

/** `default base: <name>` from the Repo section, or null. */
export function defaultBase(profile) {
  const m = (profile?.sections.Repo ?? "").match(/^default base:\s*(\S+)/m);
  return m ? m[1] : null;
}
