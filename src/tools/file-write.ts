// ============================================
// Tool: write_file — Write content to a file
// ============================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "./types.js";

function safePath(workDir: string, filePath: string): string {
  const resolved = path.resolve(workDir, filePath);
  if (!resolved.startsWith(workDir)) {
    throw new Error("Path traversal blocked — file must be within working directory");
  }
  return resolved;
}

export function createFileWriteTool(workDir: string): Tool {
  return {
    definition: {
      name: "write_file",
      description: "Write content to a file. Creates parent directories if needed. Path is relative to the working directory.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path to write" },
          content: { type: "string", description: "Content to write to the file" },
        },
        required: ["path", "content"],
      },
    },

    async execute(input) {
      const filePath = safePath(workDir, String(input.path));
      const dir = path.dirname(filePath);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, String(input.content), "utf-8");

      return `File written: ${input.path}`;
    },
  };
}
