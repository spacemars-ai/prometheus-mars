// ============================================
// Heartbeat — Keep-alive loop
// ============================================

import type { SpaceMarsClient } from "../channels/spacemars-api.js";

/**
 * Start the heartbeat loop. Fires one immediate call,
 * then repeats at the given interval.
 *
 * Returns the interval handle (pass to `stopHeartbeat` on shutdown).
 */
export function startHeartbeat(
  client: SpaceMarsClient,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  const beat = async () => {
    try {
      const res = await client.heartbeat();
      if (res.success && res.data) {
        const d = res.data;
        console.log(
          `[Heartbeat] Agent: ${d.agent.name} | ` +
            `Tasks open: ${d.tasks.open_count} | ` +
            `Next heartbeat: ${d.next_heartbeat_seconds}s`,
        );
      } else {
        console.warn(`[Heartbeat] Warning: ${res.error ?? "no data"}`);
      }
    } catch (err) {
      console.warn(
        "[Heartbeat] Failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  // Immediate first beat
  beat();

  const handle = setInterval(beat, intervalMs);
  console.log(
    `[Heartbeat] Started (interval: ${Math.round(intervalMs / 1000)}s)`,
  );
  return handle;
}

/**
 * Stop the heartbeat loop.
 */
export function stopHeartbeat(handle: ReturnType<typeof setInterval>): void {
  clearInterval(handle);
  console.log("[Heartbeat] Stopped.");
}
