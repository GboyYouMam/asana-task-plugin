import os from "node:os";
import path from "node:path";

/**
 * Persistent state root, shared by the hook and the bin scripts. A fixed path on purpose:
 * CLAUDE_PLUGIN_DATA is not present in the environment of shell commands the model runs,
 * so using it would let the hook and the scripts disagree. ASANA_TASK_DATA overrides (tests).
 */
export function dataDir() {
  const fromEnv = process.env.ASANA_TASK_DATA;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return path.join(os.homedir(), ".claude", "asana-task-data");
}
