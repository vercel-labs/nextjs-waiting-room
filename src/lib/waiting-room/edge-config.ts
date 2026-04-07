/**
 * Vercel Edge Config integration for dynamic runtime configuration.
 *
 * Why Edge Config?
 *   Environment variables are baked in at deploy time — changing capacity or
 *   TTLs requires a redeploy. Edge Config lets operators tune these knobs
 *   instantly via the Vercel dashboard or API, with changes propagating
 *   globally in ~seconds. On Vercel, reads are in-memory (no network hop),
 *   so there's zero latency cost.
 *
 * What lives in Edge Config vs env vars?
 *   - Edge Config: runtime-tunable knobs (capacity, TTLs, failOpen)
 *   - Env vars: secrets (Redis URLs/tokens), deploy-time decisions (provider)
 *   - Both: Edge Config takes precedence, env vars are the fallback,
 *     hardcoded defaults are the final safety net.
 *
 * Edge Config key convention:
 *   All keys are prefixed with "waitingRoom" to avoid collisions when the
 *   Edge Config store is shared with other features.
 *
 *   | Edge Config Key                  | Type    | Maps to               |
 *   |----------------------------------|---------|-----------------------|
 *   | waitingRoomCapacity              | number  | capacity              |
 *   | waitingRoomSessionTtlSeconds     | number  | sessionTtlSeconds     |
 *   | waitingRoomQueueTtlSeconds       | number  | queueTtlSeconds       |
 *   | waitingRoomFailOpen              | boolean | failOpen              |
 */

import type { WaitingRoomConfig } from "./types";

/** The shape of waiting-room keys we read from Edge Config. */
interface EdgeConfigWaitingRoom {
  waitingRoomCapacity?: number;
  waitingRoomFailOpen?: boolean;
  waitingRoomQueueTtlSeconds?: number;
  waitingRoomSessionTtlSeconds?: number;
}

const EDGE_CONFIG_KEYS = [
  "waitingRoomCapacity",
  "waitingRoomSessionTtlSeconds",
  "waitingRoomQueueTtlSeconds",
  "waitingRoomFailOpen",
] as const;

/**
 * Read dynamic config overrides from Vercel Edge Config.
 *
 * Returns a partial config — only keys present in Edge Config are included.
 * Missing keys are omitted (not defaulted) so the caller can layer in env
 * var fallbacks cleanly.
 *
 * Returns an empty object if:
 *   - EDGE_CONFIG env var is not set (local dev without Edge Config)
 *   - @vercel/edge-config is not installed (shouldn't happen, but defensive)
 *   - Edge Config read fails (network error, invalid connection string, etc.)
 */
export async function readEdgeConfig(): Promise<Partial<WaitingRoomConfig>> {
  // Skip entirely if no connection string — common in local dev.
  if (!process.env.EDGE_CONFIG) {
    return {};
  }

  try {
    // Dynamic import so the module is tree-shaken when EDGE_CONFIG is unset
    // and the project builds fine even if @vercel/edge-config isn't installed.
    const { getAll } = await import("@vercel/edge-config");
    const raw = await getAll<EdgeConfigWaitingRoom>([...EDGE_CONFIG_KEYS]);

    const overrides: Partial<WaitingRoomConfig> = {};

    if (
      typeof raw.waitingRoomCapacity === "number" &&
      raw.waitingRoomCapacity > 0
    ) {
      overrides.capacity = raw.waitingRoomCapacity;
    }
    if (
      typeof raw.waitingRoomSessionTtlSeconds === "number" &&
      raw.waitingRoomSessionTtlSeconds > 0
    ) {
      overrides.sessionTtlSeconds = raw.waitingRoomSessionTtlSeconds;
    }
    if (
      typeof raw.waitingRoomQueueTtlSeconds === "number" &&
      raw.waitingRoomQueueTtlSeconds > 0
    ) {
      overrides.queueTtlSeconds = raw.waitingRoomQueueTtlSeconds;
    }
    if (typeof raw.waitingRoomFailOpen === "boolean") {
      overrides.failOpen = raw.waitingRoomFailOpen;
    }

    return overrides;
  } catch (error) {
    // Edge Config read failures must never take down the waiting room.
    // Log and return empty — the caller falls through to env vars / defaults.
    console.warn(
      "[WaitingRoom] Edge Config read failed, using env var fallbacks:",
      error
    );
    return {};
  }
}
