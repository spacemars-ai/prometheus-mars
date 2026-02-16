// ============================================
// Tool System — Type Definitions
// ============================================

/** JSON Schema definition sent to the LLM so it knows how to call a tool. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** A tool call request from the LLM. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Result returned to the LLM after executing a tool. */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Interface that each built-in tool must implement. */
export interface Tool {
  definition: ToolDefinition;
  execute(input: Record<string, unknown>): Promise<string>;
}
