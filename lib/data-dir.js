import os from "node:os";
import path from "node:path";

/** Persistent state root. CLAUDE_PLUGIN_DATA survives plugin updates; the fallback serves older CLIs. */
export function dataDir() {
  const fromEnv = process.env.CLAUDE_PLUGIN_DATA;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return path.join(os.homedir(), ".claude", "asana-task-data");
}
