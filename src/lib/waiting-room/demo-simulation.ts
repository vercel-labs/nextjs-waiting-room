import type { DemoSimulationState, QueuedWaitingRoomStatus } from "./types";

/**
 * Demo-only helpers.
 *
 * These utilities let a single browser simulate queue pressure for the sample
 * app. The production waiting-room flow works without this file.
 */
export const DEFAULT_DEMO_PEOPLE_AHEAD = 5;
export const DEFAULT_DEMO_SLOT_INTERVAL_SECONDS = 12;
export const MAX_DEMO_PEOPLE_AHEAD = 100;
export const MIN_DEMO_SLOT_INTERVAL_SECONDS = 1;
export const MAX_DEMO_SLOT_INTERVAL_SECONDS = 45;

interface DemoSimulationInput {
  peopleAhead: number;
  slotIntervalSeconds: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatEstimatedWait(seconds: number): string {
  if (seconds <= 0) {
    return "Instant";
  }

  if (seconds < 60) {
    return `~${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `~${minutes}m`;
  }

  return `~${minutes}m ${remainingSeconds}s`;
}

export function normalizeDemoSimulationInput(
  input: DemoSimulationInput
): DemoSimulationInput {
  const peopleAhead = clamp(
    Math.round(Number.isFinite(input.peopleAhead) ? input.peopleAhead : 0),
    0,
    MAX_DEMO_PEOPLE_AHEAD
  );

  const slotIntervalSeconds =
    peopleAhead === 0
      ? DEFAULT_DEMO_SLOT_INTERVAL_SECONDS
      : clamp(
          Math.round(
            Number.isFinite(input.slotIntervalSeconds)
              ? input.slotIntervalSeconds
              : DEFAULT_DEMO_SLOT_INTERVAL_SECONDS
          ),
          MIN_DEMO_SLOT_INTERVAL_SECONDS,
          MAX_DEMO_SLOT_INTERVAL_SECONDS
        );

  return {
    peopleAhead,
    slotIntervalSeconds,
  };
}

export function estimateDemoWaitSeconds(input: DemoSimulationInput): number {
  const normalized = normalizeDemoSimulationInput(input);
  return normalized.peopleAhead * normalized.slotIntervalSeconds;
}

export function createDemoSimulationState(
  input: DemoSimulationInput,
  startedAt = Date.now()
): DemoSimulationState | null {
  const normalized = normalizeDemoSimulationInput(input);

  if (normalized.peopleAhead === 0) {
    return null;
  }

  return {
    ...normalized,
    startedAt,
  };
}

export function serializeDemoSimulationState(
  state: DemoSimulationState | null
): string | null {
  if (!state) {
    return null;
  }

  return JSON.stringify(state);
}

export function parseDemoSimulationState(
  rawValue: string | null | undefined
): DemoSimulationState | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<DemoSimulationState>;
    if (
      typeof parsed.peopleAhead !== "number" ||
      typeof parsed.slotIntervalSeconds !== "number" ||
      typeof parsed.startedAt !== "number"
    ) {
      return null;
    }

    return createDemoSimulationState(
      {
        peopleAhead: parsed.peopleAhead,
        slotIntervalSeconds: parsed.slotIntervalSeconds,
      },
      parsed.startedAt
    );
  } catch {
    return null;
  }
}

export function resolveDemoQueuedStatus(
  simulation: DemoSimulationState | null,
  now = Date.now()
): QueuedWaitingRoomStatus | null {
  if (!simulation) {
    return null;
  }

  const totalWaitSeconds = estimateDemoWaitSeconds(simulation);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - simulation.startedAt) / 1000)
  );
  const remainingSeconds = totalWaitSeconds - elapsedSeconds;

  if (remainingSeconds <= 0) {
    return null;
  }

  const peopleAheadRemaining = Math.ceil(
    remainingSeconds / simulation.slotIntervalSeconds
  );

  return {
    status: "queued",
    estimatedWait: remainingSeconds,
    position: peopleAheadRemaining + 1,
    demo: {
      mode: "simulated",
      peopleAhead: simulation.peopleAhead,
      slotIntervalSeconds: simulation.slotIntervalSeconds,
      admitAt: simulation.startedAt + totalWaitSeconds * 1000,
      totalWaitSeconds,
    },
  };
}
