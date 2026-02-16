// ============================================
// Tool: web_fetch — Fetch a URL and return text content
// ============================================

import type { Tool } from "./types.js";

const TIMEOUT_MS = 10_000;
const MAX_SIZE = 100 * 1024; // 100 KB

/** Strip HTML tags and compress whitespace for a readable text output. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function createWebFetchTool(): Tool {
  return {
    definition: {
      name: "web_fetch",
      description: "Fetch a URL and return its text content. HTML is automatically converted to plain text. Max 100KB.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
        },
        required: ["url"],
      },
    },

    async execute(input) {
      const url = String(input.url);

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("URL must start with http:// or https://");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Prometheus-Mars/0.2.0" },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const contentType = res.headers.get("content-type") ?? "";
        const text = await res.text();

        if (text.length > MAX_SIZE) {
          const truncated = text.slice(0, MAX_SIZE);
          const body = contentType.includes("html") ? htmlToText(truncated) : truncated;
          return body + "\n\n[Truncated — response exceeded 100KB]";
        }

        return contentType.includes("html") ? htmlToText(text) : text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
