/**
 * Pure decision logic for the PreToolUse guard. No I/O and no side effects: the hook entrypoint
 * supplies a context and consumes the push grant itself when the final decision allows a push.
 *
 * @typedef {{ kind: "allow", needsGrant?: true } | { kind: "block", reason: string } | { kind: "ask", reason: string } | { kind: "warn", context: string }} Decision
 * @typedef {{ active: boolean, branch: string, hasGrant: () => boolean, forbidden: string[], stagedPaths: () => string[], stagedDiff: () => string }} GuardContext
 */

const ALLOW = { kind: "allow" };
const STAGE_ALL = new Set([".", "./", "*", "-A", "--all", "-u", "--update", ":/"]);
const WRAPPER_FLAGS = new Set(["/c", "-c", "-command", "-Command", "/C"]);
const WRAPPERS = new Set(["cmd", "cmd.exe", "sh", "bash", "pwsh", "pwsh.exe", "powershell", "powershell.exe"]);

/** Splits a command line into segments on `&&`, `||`, `;`, `|`, newlines and `( ) { }` outside quotes; each segment into words. */
export function tokenize(command) {
  const segments = [];
  let words = [];
  let word = "";
  let quote = null;
  let inWord = false;
  const flushWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const flushSegment = () => {
    flushWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
      inWord = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") { flushSegment(); i++; continue; }
    if (ch === "|" && command[i + 1] === "|") { flushSegment(); i++; continue; }
    if (";|\n(){}".includes(ch)) { flushSegment(); continue; }
    if (ch === "$" && command[i + 1] === "(") { flushSegment(); i++; continue; }
    if (/\s/.test(ch)) { flushWord(); continue; }
    word += ch;
    inWord = true;
  }
  flushSegment();
  return segments;
}

function normalizeHead(words) {
  const out = [...words];
  while (out.length && (out[0] === "&" || out[0] === "sudo")) out.shift();
  if (out.length && /^git(\.exe)?$/i.test(out[0])) out[0] = "git";
  return out;
}

/** For a `git [global opts] <sub> ...` segment returns { sub, args }, else null. */
function gitCall(words) {
  if (words[0] !== "git") return null;
  let i = 1;
  while (i < words.length && words[i].startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree"].includes(words[i])) i += 2;
    else i += 1;
  }
  return i < words.length ? { sub: words[i], args: words.slice(i + 1) } : null;
}

/** The source side of each push refspec (`src:dst` → `src`), ignoring options and the remote. */
function pushSources(args) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (["-o", "--push-option", "--receive-pack", "--exec", "--repo"].includes(a)) i++;
      continue;
    }
    positional.push(a);
  }
  return positional.slice(1).map((r) => r.replace(/^\+/, "").split(":")[0]);
}

function evalGit({ sub, args }, ctx) {
  if (sub === "add") {
    if (args.some((a) => STAGE_ALL.has(a))) {
      return { kind: "block", reason: "asana-task guard: staging everything (`git add .`, `-A`, `-u`, `*`) is blocked inside a task. Stage explicit paths from the brief instead." };
    }
    return ALLOW;
  }
  if (sub === "push") {
    if (args.some((a) => a === "--force" || a === "-f" || a === "--force-with-lease" || a.startsWith("+"))) {
      return { kind: "block", reason: "asana-task guard: force-push is never allowed from the pipeline. Ask the user to do it by hand if history must be rewritten." };
    }
    if (args.includes("--no-verify")) {
      return { kind: "block", reason: "asana-task guard: `--no-verify` is blocked. Fix what the pre-push hook reported; only retry with --no-verify by hand if the hook printed success and the push itself failed." };
    }
    const other = pushSources(args).find((src) => src !== ctx.branch && src !== "HEAD");
    if (other) {
      return { kind: "block", reason: `asana-task guard: the push grant is for \`${ctx.branch}\`, not \`${other}\`. Ask the user and grant that branch explicitly.` };
    }
    if (!ctx.hasGrant()) {
      return { kind: "block", reason: "asana-task guard: no push grant for this branch. Ask the user whether to push; when they say yes, run asana-task-allow-push.js and push again." };
    }
    return { kind: "allow", needsGrant: true };
  }
  if (sub === "commit") {
    const problems = [];
    const staged = ctx.stagedPaths();
    if (staged.includes("package-lock.json")) problems.push("package-lock.json is staged");
    for (const f of ctx.forbidden) if (staged.includes(f)) problems.push(`forbidden path staged: ${f}`);
    if (ctx.stagedDiff().includes("[DBG")) problems.push("staged diff contains a [DBG line");
    if (problems.length) {
      return { kind: "warn", context: `asana-task guard: review before committing — ${problems.join("; ")}.` };
    }
    return ALLOW;
  }
  return ALLOW;
}

function evalSegment(rawWords, ctx) {
  const words = normalizeHead(rawWords);
  if (WRAPPERS.has(words[0]?.toLowerCase())) {
    const idx = words.findIndex((w, i) => i > 0 && WRAPPER_FLAGS.has(w));
    if (idx >= 0 && words[idx + 1]) return evalCommand(words.slice(idx + 1).join(" "), ctx);
  }
  const git = gitCall(words);
  if (git) return evalGit(git, ctx);
  if (words[0] === "gh" && words[1] === "pr" && (words[2] === "create" || words[2] === "comment")) {
    return { kind: "ask", reason: `asana-task guard: \`gh pr ${words[2]}\` is an outward action. Confirm with the user.` };
  }
  if (words[0] === "npm" && words[1] === "ci" && words.includes("--no-package-lock")) {
    return { kind: "warn", context: "asana-task guard: `npm ci --no-package-lock` breaks tooling that reads the lockfile; prefer `npm install` then `git checkout -- package-lock.json`." };
  }
  const tool = words[0] === "npx" ? words[1] : words[0];
  if ((tool === "prettier" || tool === "eslint") && words.includes(".")) {
    return { kind: "warn", context: `asana-task guard: repo-wide \`${tool}\` on \`.\` creates formatting churn outside the task; run it on the changed files only.` };
  }
  return ALLOW;
}

const RANK = { allow: 0, warn: 1, ask: 2, block: 3 };

function merge(a, b) {
  if (RANK[b.kind] > RANK[a.kind]) return b;
  if (b.kind === "warn" && a.kind === "warn") return { kind: "warn", context: `${a.context} ${b.context}` };
  if (a.kind === "allow" && b.kind === "allow" && (a.needsGrant || b.needsGrant)) return { kind: "allow", needsGrant: true };
  return a;
}

function evalCommand(command, ctx) {
  let decision = ALLOW;
  for (const words of tokenize(command)) decision = merge(decision, evalSegment(words, ctx));
  return decision;
}

/**
 * @param {{ tool_name: string, tool_input: any, cwd: string }} input
 * @param {GuardContext} ctx
 * @returns {Decision}
 */
export function evaluate(input, ctx) {
  if (!ctx.active) return ALLOW;
  if (/add_comment$/.test(input.tool_name)) {
    return { kind: "ask", reason: "asana-task guard: posting a comment is an outward action. Confirm with the user." };
  }
  if (input.tool_name !== "Bash" && input.tool_name !== "PowerShell") return ALLOW;
  return evalCommand(input.tool_input?.command ?? "", ctx);
}
