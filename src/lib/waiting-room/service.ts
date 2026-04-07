import { getProvider } from ".";
import { resolveConfig } from "./config";
import { getWaitingRoomInitPath, getWaitingRoomPath } from "./cookies";
import { resolveDemoQueuedStatus } from "./demo-simulation";
import {
  type DemoSimulationState,
  isQueuedProvider,
  type QueuedWaitingRoomStatus,
  type WaitingRoomConfig,
  type WaitingRoomProvider,
  type WaitingRoomStatus,
} from "./types";

/**
 * Shared waiting-room state machine.
 *
 * Read this file after `src/proxy.ts`. The rest of the repo delegates here:
 * - Proxy asks whether a protected request should continue or redirect.
 * - Route handlers ask how to initialize or poll a queue session.
 * - Server Components ask which UI state to render.
 */
export const PROVIDER_HEALTHCHECK_ID = "__wr_healthcheck__";

export type EntryResolution =
  | { status: "allow" }
  | { status: "redirect"; destination: string };

export type ProtectedPageState =
  | { status: "active"; activeCount: number; userId: string }
  | { status: "degraded"; userId: string | null }
  | { status: "redirect"; destination: string };

export type ProxyAccessDecision =
  | { status: "allow" }
  | {
      status: "renew";
      config: WaitingRoomConfig;
      renewedAt: number;
      renewSession: () => Promise<void>;
      userId: string;
    }
  | { status: "redirect"; destination: string };

export type WaitingRoomPageState =
  | { status: "queued"; queue: QueuedWaitingRoomStatus }
  | { status: "redirect"; destination: string }
  | { status: "unavailable" };

async function resolveRuntime(): Promise<{
  config: WaitingRoomConfig;
  provider: WaitingRoomProvider;
}> {
  const [config, provider] = await Promise.all([
    resolveConfig(),
    getProvider(),
  ]);
  return { config, provider };
}

async function probeProviderAvailability(source: string): Promise<boolean> {
  try {
    const provider = await getProvider();
    await provider.hasSession(PROVIDER_HEALTHCHECK_ID);
    return true;
  } catch (error) {
    console.error(`[WaitingRoom] ${source} probe error:`, error);
    return false;
  }
}

export async function resolveEntryRedirect(
  nextPath: string,
  source: string
): Promise<EntryResolution> {
  // First-touch decision for users without a valid session cookie.
  const config = await resolveConfig();

  if (!config.failOpen) {
    return {
      status: "redirect",
      destination: getWaitingRoomInitPath(nextPath),
    };
  }

  const providerAvailable = await probeProviderAvailability(source);
  if (providerAvailable) {
    return {
      status: "redirect",
      destination: getWaitingRoomInitPath(nextPath),
    };
  }

  return { status: "allow" };
}

export async function resolveWaitingRoomStatus(
  userId: string,
  source: string,
  simulation: DemoSimulationState | null = null
): Promise<WaitingRoomStatus> {
  // Demo simulation short-circuits the provider so a single browser can show
  // realistic queue movement without real traffic.
  const simulatedQueue = resolveDemoQueuedStatus(simulation);
  if (simulatedQueue) {
    return simulatedQueue;
  }

  const { config, provider } = await resolveRuntime();

  try {
    const hasActiveSession = await provider.hasSession(userId);
    if (hasActiveSession) {
      return { status: "admitted" };
    }

    const result = await provider.tryAdmit(userId);
    if (result.status === "admitted" || result.status === "already_active") {
      return { status: "admitted" };
    }

    let estimatedWait = -1;
    if (isQueuedProvider(provider)) {
      estimatedWait = await provider.getEstimatedWait(userId, result.position);
    }

    return {
      status: "queued",
      estimatedWait,
      position: result.position,
    };
  } catch (error) {
    console.error(`[WaitingRoom] ${source} error:`, error);
    if (config.failOpen) {
      return { status: "admitted" };
    }
    return { status: "unavailable" };
  }
}

export async function resolveWaitingRoomPageState(
  userId: string | null,
  nextPath: string,
  simulation: DemoSimulationState | null = null
): Promise<WaitingRoomPageState> {
  if (!userId) {
    return {
      status: "redirect",
      destination: getWaitingRoomInitPath(nextPath),
    };
  }

  const status = await resolveWaitingRoomStatus(userId, "page", simulation);
  switch (status.status) {
    case "admitted":
      return { status: "redirect", destination: nextPath };
    case "queued":
      return { status: "queued", queue: status };
    case "unavailable":
      return { status: "unavailable" };
    default:
      throw new Error("[WaitingRoom] Unsupported page status.");
  }
}

export async function resolveProtectedPageState(
  userId: string | null,
  nextPath: string
): Promise<ProtectedPageState> {
  if (!userId) {
    const entry = await resolveEntryRedirect(nextPath, "protected page");
    if (entry.status === "redirect") {
      return entry;
    }
    return { status: "degraded", userId: null };
  }

  const { config, provider } = await resolveRuntime();

  try {
    const hasActiveSession = await provider.hasSession(userId);
    if (!hasActiveSession) {
      return {
        status: "redirect",
        destination: getWaitingRoomPath(nextPath),
      };
    }

    const activeCount = await provider.getActiveCount();
    return {
      status: "active",
      activeCount,
      userId,
    };
  } catch (error) {
    console.error("[WaitingRoom] protected page error:", error);

    if (config.failOpen) {
      return { status: "degraded", userId };
    }

    return {
      status: "redirect",
      destination: getWaitingRoomPath(nextPath),
    };
  }
}

export async function resolveProxyAccessDecision(input: {
  lastUpdate: number;
  nextPath: string;
  userId: string | null;
}): Promise<ProxyAccessDecision> {
  // Hot path for protected routes. Keep this cheap and reuse the same
  // redirect/session rules that the rest of the app uses.
  const { lastUpdate, nextPath, userId } = input;

  if (!userId) {
    return resolveEntryRedirect(nextPath, "proxy");
  }

  const { config, provider } = await resolveRuntime();

  try {
    if (!provider.supportsProxyVerification) {
      // Local in-memory state is not shared with Proxy in development.
      // Let the app route perform the authoritative session check instead.
      return { status: "allow" };
    }

    const hasActiveSession = await provider.hasSession(userId);
    if (!hasActiveSession) {
      return {
        status: "redirect",
        destination: getWaitingRoomPath(nextPath),
      };
    }

    const now = Date.now();
    const renewalThreshold = (config.sessionTtlSeconds * 1000) / 2;

    if (!Number.isFinite(lastUpdate) || now - lastUpdate > renewalThreshold) {
      return {
        status: "renew",
        config,
        renewedAt: now,
        renewSession: () => provider.renewSession(userId),
        userId,
      };
    }

    return { status: "allow" };
  } catch (error) {
    console.error("[WaitingRoom] proxy error:", error);

    if (config.failOpen) {
      return { status: "allow" };
    }

    return {
      status: "redirect",
      destination: getWaitingRoomPath(nextPath),
    };
  }
}
