// ============================================
// Prometheus Agent Runtime
// ============================================

import type { PrometheusConfig } from "../config/config.js";
import { SpaceMarsClient } from "../channels/spacemars-api.js";
import { createLLMAdapter } from "./llm-adapter.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { TaskWorker } from "./task-worker.js";
import { loadSkillsFromDir } from "./skill-loader.js";

/** Default pause between task-loop iterations (60 seconds). */
const TASK_LOOP_INTERVAL_MS = 60_000;

/** Pause after an error before retrying (2 minutes). */
const ERROR_BACKOFF_MS = 120_000;

export class PrometheusAgent {
  private readonly client: SpaceMarsClient;
  private readonly worker: TaskWorker;
  private readonly config: PrometheusConfig;

  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: PrometheusConfig) {
    this.config = config;
    this.client = new SpaceMarsClient(config.apiUrl, config.apiKey);

    const llm = createLLMAdapter(
      config.llmProvider,
      config.llmApiKey,
      config.llmModel,
    );

    this.worker = new TaskWorker(this.client, llm);
  }

  // --------------------------------------------------
  // Lifecycle
  // --------------------------------------------------

  /** Boot the agent: verify connection, start heartbeat, enter task loop. */
  async start(): Promise<void> {
    console.log(`[Prometheus] Starting agent "${this.config.agentName}"...`);
    console.log(`[Prometheus] API: ${this.config.apiUrl}`);
    console.log(
      `[Prometheus] LLM: ${this.config.llmProvider} / ${this.config.llmModel}`,
    );

    // Load skills from SKILL.md files
    const skills = loadSkillsFromDir(this.config.skillsDir);
    this.worker.setSkills(skills);

    // Verify we can reach the API
    await this.verifyConnection();

    // Start the heartbeat loop
    this.heartbeatHandle = startHeartbeat(
      this.client,
      this.config.heartbeatIntervalMs,
    );

    // Enter the task loop
    this.running = true;
    await this.taskLoop();
  }

  /** Gracefully stop the agent. */
  stop(): void {
    console.log("[Prometheus] Shutting down...");
    this.running = false;

    if (this.heartbeatHandle) {
      stopHeartbeat(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }

    console.log("[Prometheus] Stopped.");
  }

  // --------------------------------------------------
  // Internal
  // --------------------------------------------------

  private async verifyConnection(): Promise<void> {
    try {
      const profile = await this.client.getProfile();
      if (profile.success && profile.data) {
        console.log(
          `[Prometheus] Connected as "${profile.data.name}" ` +
            `(karma: ${profile.data.karma})`,
        );
      } else {
        console.warn(
          `[Prometheus] Could not fetch profile: ${profile.error ?? "unknown"}.` +
            " Continuing anyway — the API key may be invalid or the server may not support /agents/me yet.",
        );
      }
    } catch (err) {
      console.warn(
        "[Prometheus] Could not reach API:",
        err instanceof Error ? err.message : err,
      );
      console.warn("[Prometheus] Continuing — tasks will retry on next cycle.");
    }
  }

  /**
   * Main loop: repeatedly fetch, claim, solve, and submit tasks.
   * Runs until `stop()` is called.
   */
  private async taskLoop(): Promise<void> {
    console.log("[Prometheus] Entering task loop.");

    while (this.running) {
      try {
        const didWork = await this.worker.runOnce();

        // If no tasks were found or completed, wait longer before polling again
        const waitMs = didWork ? TASK_LOOP_INTERVAL_MS : TASK_LOOP_INTERVAL_MS * 2;
        await this.sleep(waitMs);
      } catch (err) {
        console.error(
          "[Prometheus] Task loop error:",
          err instanceof Error ? err.message : err,
        );
        console.log(
          `[Prometheus] Backing off for ${ERROR_BACKOFF_MS / 1000}s before retrying...`,
        );
        await this.sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
