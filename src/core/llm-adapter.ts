// ============================================
// LLM-Agnostic Adapter
// ============================================
//
// Provides a uniform interface for calling different LLM providers.
// Supports both simple text completion and tool-use (agentic) mode.
// When no valid API key is provided, returns a placeholder response
// so the rest of the agent pipeline can still operate end-to-end.
// ============================================

import type { ToolDefinition } from "../tools/types.js";

// ---- Response types ----

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface LLMToolResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  provider: string;
  model: string;
  tokensUsed?: number;
}

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResultContent[];
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ---- Abstract base ----

export abstract class LLMAdapter {
  constructor(
    protected readonly provider: string,
    protected readonly apiKey: string,
    protected readonly model: string,
  ) {}

  /** Send a system + user prompt pair and receive a text completion. */
  abstract complete(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;

  /** Send a multi-turn conversation with tool definitions. */
  abstract completeWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolResponse>;
}

// ---- Anthropic adapter ----

class AnthropicAdapter extends LLMAdapter {
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content: text,
      provider: "anthropic",
      model: this.model,
      tokensUsed: data.usage
        ? data.usage.input_tokens + data.usage.output_tokens
        : undefined,
    };
  }

  async completeWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      content: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      >;
      stop_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const contentBlocks: ContentBlock[] = data.content.map((block) => {
      if (block.type === "tool_use") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input };
      }
      return { type: "text", text: (block as { text: string }).text };
    });

    return {
      content: contentBlocks,
      stopReason: data.stop_reason as LLMToolResponse["stopReason"],
      provider: "anthropic",
      model: this.model,
      tokensUsed: data.usage
        ? data.usage.input_tokens + data.usage.output_tokens
        : undefined,
    };
  }
}

// ---- OpenAI adapter ----

class OpenAIAdapter extends LLMAdapter {
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      provider: "openai",
      model: this.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }

  async completeWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolResponse> {
    const openaiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const first = msg.content[0] as Record<string, unknown>;
        if (first?.type === "tool_result") {
          for (const tr of msg.content as ToolResultContent[]) {
            openaiMessages.push({
              role: "tool",
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            });
          }
          continue;
        }
      }

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const textParts = (msg.content as ContentBlock[])
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("");
        const toolCalls = (msg.content as ContentBlock[])
          .filter((b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use")
          .map((b) => ({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));

        const assistantMsg: Record<string, unknown> = { role: "assistant" };
        if (textParts) assistantMsg.content = textParts;
        if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        openaiMessages.push(assistantMsg);
        continue;
      }

      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: openaiMessages,
      max_tokens: 4096,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: { total_tokens: number };
    };

    const choice = data.choices[0];
    const blocks: ContentBlock[] = [];

    if (choice.message.content) {
      blocks.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    const stopReason =
      choice.finish_reason === "tool_calls" || choice.message.tool_calls
        ? "tool_use"
        : choice.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";

    return {
      content: blocks,
      stopReason,
      provider: "openai",
      model: this.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

// ---- Google (Gemini) adapter ----

class GoogleAdapter extends LLMAdapter {
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: { totalTokenCount: number };
    };

    const text = data.candidates[0]?.content?.parts
      ?.map((p) => p.text)
      .join("") ?? "";

    return {
      content: text,
      provider: "google",
      model: this.model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  }

  async completeWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMToolResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const contents: Array<Record<string, unknown>> = [];
    for (const msg of messages) {
      const role = msg.role === "assistant" ? "model" : "user";

      if (typeof msg.content === "string") {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts: Array<Record<string, unknown>> = [];
        for (const block of msg.content) {
          if ("type" in block && block.type === "text") {
            parts.push({ text: (block as { text: string }).text });
          } else if ("type" in block && block.type === "tool_use") {
            const tu = block as ContentBlock & { type: "tool_use" };
            parts.push({ functionCall: { name: tu.name, args: tu.input } });
          } else if ("type" in block && block.type === "tool_result") {
            const tr = block as ToolResultContent;
            parts.push({
              functionResponse: {
                name: "tool",
                response: { content: tr.content },
              },
            });
          }
        }
        contents.push({ role, parts });
      }
    }

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 4096 },
    };

    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          })),
        },
      ];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      candidates: Array<{
        content: {
          parts: Array<
            | { text: string }
            | { functionCall: { name: string; args: Record<string, unknown> } }
          >;
        };
        finishReason: string;
      }>;
      usageMetadata?: { totalTokenCount: number };
    };

    const candidate = data.candidates[0];
    const blocks: ContentBlock[] = [];
    let hasToolUse = false;

    for (const part of candidate?.content?.parts ?? []) {
      if ("text" in part) {
        blocks.push({ type: "text", text: part.text });
      } else if ("functionCall" in part) {
        hasToolUse = true;
        blocks.push({
          type: "tool_use",
          id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          input: part.functionCall.args,
        });
      }
    }

    return {
      content: blocks,
      stopReason: hasToolUse ? "tool_use" : "end_turn",
      provider: "google",
      model: this.model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  }
}

// ---- Placeholder adapter (no API key) ----

class PlaceholderAdapter extends LLMAdapter {
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    console.log("[LLM Placeholder] System:", systemPrompt.slice(0, 120), "...");
    console.log("[LLM Placeholder] User:", userPrompt.slice(0, 120), "...");
    return {
      content: "[LLM response placeholder -- configure LLM_API_KEY to enable]",
      provider: "placeholder",
      model: "none",
    };
  }

  async completeWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    _tools: ToolDefinition[],
  ): Promise<LLMToolResponse> {
    console.log("[LLM Placeholder] System:", systemPrompt.slice(0, 120), "...");
    console.log("[LLM Placeholder] Messages:", messages.length);
    return {
      content: [{ type: "text", text: "[LLM response placeholder -- configure LLM_API_KEY to enable]" }],
      stopReason: "end_turn",
      provider: "placeholder",
      model: "none",
    };
  }
}

// ---- Factory ----

const PROVIDERS: Record<
  string,
  new (provider: string, apiKey: string, model: string) => LLMAdapter
> = {
  anthropic: AnthropicAdapter,
  openai: OpenAIAdapter,
  google: GoogleAdapter,
};

/**
 * Create the appropriate LLM adapter based on the provider name.
 * Falls back to a placeholder if no API key is supplied.
 */
export function createLLMAdapter(
  provider: string,
  apiKey: string,
  model: string,
): LLMAdapter {
  if (!apiKey) {
    console.warn(
      "[Prometheus] No LLM_API_KEY set — using placeholder adapter.",
    );
    return new PlaceholderAdapter("placeholder", "", "none");
  }

  const Ctor = PROVIDERS[provider.toLowerCase()];
  if (!Ctor) {
    console.warn(
      `[Prometheus] Unknown LLM provider "${provider}" — using placeholder adapter.`,
    );
    return new PlaceholderAdapter("placeholder", "", "none");
  }

  return new Ctor(provider, apiKey, model);
}
