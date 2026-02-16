// ============================================
// Tool: bash — Execute a shell command
// ============================================

import { execSync } from "node:child_process";
import type { Tool } from "./types.js";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 64 * 1024; // 64 KB

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bsudo\b/,
  /\bchmod\s+777/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
];

export function createBashTool(workDir: string): Tool {
  return {
    definition: {
      name: "bash",
      description: "Execute a shell command and return its output. Timeout: 30 seconds. Destructive commands are blocked.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
        },
        required: ["command"],
      },
    },

    async execute(input) {
      const command = String(input.command);

      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          throw new Error(`Blocked: command matches dangerous pattern ${pattern}`);
        }
      }

      try {
        const output = execSync(command, {
          cwd: workDir,
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        return output || "(no output)";
      } catch (err: unknown) {
        const execErr = err as { stderr?: string; stdout?: string; message?: string };
        const stderr = execErr.stderr || "";
        const stdout = execErr.stdout || "";
        throw new Error(`Command failed:\n${stderr || stdout || execErr.message}`);
      }
    },
  };
}
