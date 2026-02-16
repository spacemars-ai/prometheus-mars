// ============================================
// Tool Executor — dispatches tool calls
// ============================================

import type { Tool, ToolCall, ToolDefinition, ToolResult } from "./types.js";

export class ToolExecutor {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      return {
        tool_use_id: call.id,
        content: `Unknown tool: ${call.name}`,
        is_error: true,
      };
    }

    try {
      const output = await tool.execute(call.input);
      return { tool_use_id: call.id, content: output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { tool_use_id: call.id, content: `Error: ${message}`, is_error: true };
    }
  }
}
