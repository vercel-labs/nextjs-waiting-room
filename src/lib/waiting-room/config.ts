import { readEdgeConfig } from "./edge-config";
import type { WaitingRoomConfig } from "./types";

// --- Config cache with TTL ---
// In serverless (new process per request), the cache is effectively per-request.
// In long-lived processes (dev server, standalone Node), the TTL ensures Edge
// Config changes propagate within 60 seconds without a restart.
const CACHE_TTL_MS = 60_000;
let _config: WaitingRoomConfig | null = null;
let _cachedAt = 0;

export function readEnvConfig(): WaitingRoomConfig {
  return {
    capacity: Number.parseInt(process.env.WAITING_ROOM_CAPACITY ?? "100", 10),
    sessionTtlSeconds: Number.parseInt(
      process.env.WAITING_ROOM_SESSION_TTL_SECONDS ?? "300",
      10
    ),
    queueTtlSeconds: Number.parseInt(
      process.env.WAITING_ROOM_QUEUE_TTL_SECONDS ?? "1800",
      10
    ),
    namespace: process.env.WAITING_ROOM_NAMESPACE ?? "default",
    failOpen: process.env.WAITING_ROOM_FAIL_OPEN !== "false",
  };
}

export function mergeConfig(
  baseConfig: WaitingRoomConfig,
  overrides: Partial<WaitingRoomConfig>
): WaitingRoomConfig {
  return {
    capacity: overrides.capacity ?? baseConfig.capacity,
    sessionTtlSeconds:
      overrides.sessionTtlSeconds ?? baseConfig.sessionTtlSeconds,
    queueTtlSeconds: overrides.queueTtlSeconds ?? baseConfig.queueTtlSeconds,
    namespace: overrides.namespace ?? baseConfig.namespace,
    failOpen: overrides.failOpen ?? baseConfig.failOpen,
  };
}

/**
 * Preload config from Edge Config + env vars. Call once at each entry point
 * (proxy.ts, API route, page.tsx) before any sync getConfig() calls.
 *
 * Layering order: Edge Config > env vars > hardcoded defaults.
 */
export async function resolveConfig(): Promise<WaitingRoomConfig> {
  const now = Date.now();
  if (_config && now - _cachedAt < CACHE_TTL_MS) {
    return _config;
  }

  const edgeOverrides = await readEdgeConfig();
  _config = mergeConfig(readEnvConfig(), edgeOverrides);
  _cachedAt = now;

  return _config;
}

/**
 * Synchronous config access. Requires resolveConfig() to have been called
 * earlier in the request lifecycle. Falls back to env vars if called before
 * resolveConfig() (e.g. during provider construction).
 */
export function getConfig(): WaitingRoomConfig {
  if (_config) {
    return _config;
  }

  // Fallback: env vars only (no Edge Config). This path runs if a provider
  // method is called before resolveConfig() — shouldn't happen in normal
  // flow, but we degrade gracefully instead of throwing.
  _config = readEnvConfig();
  return _config;
}

export function keyFor(suffix: string): string {
  return `wr:${getConfig().namespace}:${suffix}`;
}
