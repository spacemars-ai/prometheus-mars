// ============================================
// LLM-Agnostic Adapter
// ============================================
//
// Provides a uniform interface for calling different LLM providers.
// When no valid API key is provided, returns a placeholder response
// so the rest of the agent pipeline can still operate end-to-end.
// ============================================

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
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
