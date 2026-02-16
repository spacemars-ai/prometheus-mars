// ============================================
// Tool: web_search — Search the web via DuckDuckGo (zero deps)
// ============================================

import type { Tool } from "./types.js";

const TIMEOUT_MS = 10_000;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Extract search results from DuckDuckGo HTML response. */
function parseDDGResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // DuckDuckGo lite returns results in <a> tags with class="result-link"
  // Fallback: parse <a class="result__a"> patterns from the HTML
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1].replace(/&amp;/g, "&");
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (url && title) links.push({ url, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
    });
  }

  // If regex parsing failed, try DuckDuckGo lite format
  if (results.length === 0) {
    const liteRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = liteRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (url && title && !url.includes("duckduckgo.com")) {
        results.push({ title, url, snippet: "" });
      }
    }
  }

  return results.slice(0, 8);
}

export function createWebSearchTool(): Tool {
  return {
    definition: {
      name: "web_search",
      description: "Search the web and return a list of results with titles, URLs, and snippets.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },

    async execute(input) {
      const query = String(input.query);
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Prometheus-Mars/0.2.0",
            "Accept": "text/html",
          },
        });

        if (!res.ok) {
          throw new Error(`Search failed: HTTP ${res.status}`);
        }

        const html = await res.text();
        const results = parseDDGResults(html);

        if (results.length === 0) {
          return "No results found.";
        }

        return results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join("\n\n");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
