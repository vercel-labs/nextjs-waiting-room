import { getProvider } from ".";
import {
  createAdmissionToken,
  type VerifiedAdmissionToken,
  verifyAdmissionToken,
} from "./admission-token";
import { getConfig, resolveConfig } from "./config";
import { getWaitingRoomInitPath } from "./cookies";
import { resolveDemoQueuedStatus } from "./demo-simulation";
import type {
  DemoSimulationState,
  WaitingRoomConfig,
  WaitingRoomProvider,
  WaitingRoomStatus,
} from "./types";

export interface EntryResolution {
  destination: string;
  status: "redirect";
}

export type ProtectedPageState =
  | { status: "active"; userId: string }
  | { status: "redirect"; destination: string };

export type ProxyAccessDecision =
  | { status: "allow" }
  | {
      status: "renew";
      admissionToken: string;
      config: WaitingRoomConfig;
      renewSession: () => Promise<void>;
      userId: string;
    }
  | { status: "redirect"; destination: string };

export type WaitingRoomPageState =
  | { status: "queued" }
  | { status: "redirect"; destination: string };

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

function estimateWaitSeconds(
  position: number,
  config: WaitingRoomConfig
): number {
  if (position <= 1) {
    return Math.max(3, Math.ceil(config.sessionTtlSeconds / config.capacity));
  }

  return Math.max(
    3,
    Math.ceil((position * config.sessionTtlSeconds) / config.capacity)
  );
}

export function readAdmission(
  userToken: string | null | undefined
): VerifiedAdmissionToken | null {
  return verifyAdmissionToken(userToken);
}

export function resolveEntryRedirect(nextPath: string): EntryResolution {
  return {
    status: "redirect",
    destination: getWaitingRoomInitPath(nextPath),
  };
}

export async function resolveWaitingRoomStatus(
  userId: string,
  source: string,
  simulation: DemoSimulationState | null = null
): Promise<WaitingRoomStatus> {
  const simulatedQueue = resolveDemoQueuedStatus(simulation);
  if (simulatedQueue) {
    return simulatedQueue;
  }

  const { config, provider } = await resolveRuntime();

  try {
    const result = await provider.tryAdmit(userId);
    if (result.status === "admitted" || result.status === "already_active") {
      return { status: "admitted" };
    }

    return {
      status: "queued",
      estimatedWait: estimateWaitSeconds(result.position, config),
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

export function resolveWaitingRoomPageState(
  admissionToken: string | null | undefined,
  nextPath: string
): WaitingRoomPageState {
  if (readAdmission(admissionToken)) {
    return { status: "redirect", destination: nextPath };
  }

  return { status: "queued" };
}

export function resolveProtectedPageState(
  admissionToken: string | null | undefined,
  nextPath: string
): ProtectedPageState {
  const verified = readAdmission(admissionToken);
  if (!verified) {
    return resolveEntryRedirect(nextPath);
  }

  return {
    status: "active",
    userId: verified.userId,
  };
}

export function resolveProxyAccessDecision(input: {
  admissionToken: string | null;
  nextPath: string;
}): ProxyAccessDecision {
  const { admissionToken, nextPath } = input;
  const verified = readAdmission(admissionToken);

  if (!verified) {
    return resolveEntryRedirect(nextPath);
  }

  const now = Date.now();
  const config = getConfig();
  const renewalThresholdMs = (config.sessionTtlSeconds * 1000) / 2;
  if (verified.expiresAt - now > renewalThresholdMs) {
    return { status: "allow" };
  }

  return {
    status: "renew",
    admissionToken: createAdmissionToken(verified.userId, now),
    config,
    renewSession: async () => {
      const provider = await getProvider();
      await provider.renewSession(verified.userId);
    },
    userId: verified.userId,
  };
}
