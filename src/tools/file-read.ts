// ============================================
// Tool: read_file — Read a file from the working directory
// ============================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "./types.js";

const MAX_SIZE = 256 * 1024; // 256 KB

function safePath(workDir: string, filePath: string): string {
  const resolved = path.resolve(workDir, filePath);
  if (!resolved.startsWith(workDir)) {
    throw new Error("Path traversal blocked — file must be within working directory");
  }
  return resolved;
}

export function createFileReadTool(workDir: string): Tool {
  return {
    definition: {
      name: "read_file",
      description: "Read the contents of a file. The path is relative to the working directory.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path to read" },
        },
        required: ["path"],
      },
    },

    async execute(input) {
      const filePath = safePath(workDir, String(input.path));

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${input.path}`);
      }

      const stat = fs.statSync(filePath);
      if (stat.size > MAX_SIZE) {
        throw new Error(`File too large (${stat.size} bytes, max ${MAX_SIZE})`);
      }

      return fs.readFileSync(filePath, "utf-8");
    },
  };
}
