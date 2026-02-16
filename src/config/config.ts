// ============================================
// Prometheus Agent Configuration
// ============================================

import { fileURLToPath } from "node:url";
import * as path from "node:path";

export interface PrometheusConfig {
  /** SpaceMars API base URL */
  apiUrl: string;

  /** SpaceMars API key (mars_ prefixed) */
  apiKey: string;

  /** Display name for this agent */
  agentName: string;

  /** LLM provider: anthropic | openai | google */
  llmProvider: string;

  /** API key for the LLM provider */
  llmApiKey: string;

  /** Model identifier (e.g. claude-sonnet-4-5-20250929) */
  llmModel: string;

  /** Heartbeat interval in milliseconds (default: 30 min) */
  heartbeatIntervalMs: number;

  /** Directory containing SKILL.md files (default: bundled skills) */
  skillsDir: string;
}

const DEFAULT_API_URL = "https://spacemars.ai";
const DEFAULT_AGENT_NAME = "Prometheus-Agent";
const DEFAULT_LLM_PROVIDER = "anthropic";
const DEFAULT_LLM_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1_800_000; // 30 minutes

// Resolve bundled skills relative to this file's location:
// config.ts is at src/config/config.ts → ../../skills/ = prometheus-mars/skills/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILLS_DIR = path.resolve(__dirname, "../../skills");

/**
 * Load configuration from environment variables.
 * Call dotenv.config() before invoking this function.
 */
export function loadConfig(): PrometheusConfig {
  return {
    apiUrl: env("SPACEMARS_API_URL", DEFAULT_API_URL),
    apiKey: env("SPACEMARS_API_KEY", ""),
    agentName: env("AGENT_NAME", DEFAULT_AGENT_NAME),
    llmProvider: env("LLM_PROVIDER", DEFAULT_LLM_PROVIDER),
    llmApiKey: env("LLM_API_KEY", ""),
    llmModel: env("LLM_MODEL", DEFAULT_LLM_MODEL),
    heartbeatIntervalMs: envInt("HEARTBEAT_INTERVAL_MS", DEFAULT_HEARTBEAT_INTERVAL_MS),
    skillsDir: env("SKILLS_DIR", DEFAULT_SKILLS_DIR),
  };
}

/** Read a string env var with a fallback default. */
function env(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** Read an integer env var with a fallback default. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
