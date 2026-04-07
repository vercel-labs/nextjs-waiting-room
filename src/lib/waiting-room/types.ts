/**
 * Result of an admission attempt.
 *
 * - `admitted`       – user was admitted (session created atomically)
 * - `queued`         – capacity full, user placed in queue
 * - `already_active` – user already has an active session
 */
export type AdmitResult =
  | { status: "admitted" }
  | { status: "queued"; position: number }
  | { status: "already_active" };

/**
 * Browser-scoped demo simulation settings used to create realistic queue
 * pressure for a single demo session.
 */
export interface DemoSimulationState {
  /** Number of synthetic visitors ahead of the current browser. */
  peopleAhead: number;
  /** Seconds between synthetic admissions. */
  slotIntervalSeconds: number;
  /** When this simulation run started, in epoch milliseconds. */
  startedAt: number;
}

/**
 * Extra metadata included when a queued state is coming from the demo
 * simulator rather than the backing provider.
 */
export interface DemoQueueMetadata {
  admitAt: number;
  mode: "simulated";
  peopleAhead: number;
  slotIntervalSeconds: number;
  totalWaitSeconds: number;
}

/**
 * Status response returned by the polling endpoint.
 *
 * Explicit variants keep the client/UI logic honest. Consumers do not need to
 * infer state from nullable fields or impossible combinations.
 */
export type WaitingRoomStatus =
  | { status: "admitted" }
  | {
      status: "queued";
      /** Estimated seconds until admission, -1 if unknown */
      estimatedWait: number;
      /** Current queue position (1-indexed), null if provider does not support queues */
      position: number | null;
      /** Demo-only metadata for simulated traffic ahead of the current browser. */
      demo?: DemoQueueMetadata;
    }
  | { status: "unavailable" };

export type QueuedWaitingRoomStatus = Extract<
  WaitingRoomStatus,
  { status: "queued" }
>;

/**
 * Shared waiting-room provider contract.
 *
 * The hot path is intentionally narrow:
 * - `tryAdmit()` is the authoritative queue transition check
 * - `hasSession()` and `renewSession()` are used for admitted-session renewal
 * - `getActiveCount()` exists for demo stats, not the protected route
 */
export interface WaitingRoomProvider {
  /**
   * Get the count of currently active sessions.
   * Expired sessions are purged before counting.
   */
  getActiveCount(): Promise<number>;

  /**
   * Check if a user has an active session.
   * Used by status checks and demo stats. The proxy hot path uses signed
   * admission tokens instead of consulting the provider for every request.
   */
  hasSession(userId: string): Promise<boolean>;

  /**
   * Renew an active session's TTL.
   * Called infrequently via `event.waitUntil()` in proxy when an admission
   * token is nearing expiry.
   */
  renewSession(userId: string): Promise<void>;

  /**
   * Atomically attempt to admit a user.
   *
   * Implementations should:
   * - purge expired active sessions
   * - join the queue if the user is not already queued
   * - admit the user if capacity is available and they are at the front
   * - otherwise return the user's current queue position
   *
   * Returns the result of the attempt.
   */
  tryAdmit(userId: string): Promise<AdmitResult>;
}

/**
 * Configuration for the waiting room.
 * All values are read from environment variables with sensible defaults.
 */
export interface WaitingRoomConfig {
  /** Maximum number of concurrent active users. Default: 100 */
  capacity: number;
  /** Whether to let all traffic through if the provider is unavailable. Default: true */
  failOpen: boolean;
  /** Redis key namespace to avoid collisions. Default: "default" */
  namespace: string;
  /** Queue entry TTL in seconds (abandoned entries purged after this). Default: 1800 (30 minutes) */
  queueTtlSeconds: number;
  /** Session TTL in seconds. Default: 300 (5 minutes) */
  sessionTtlSeconds: number;
}

/**
 * Cookie names used by the waiting room.
 */
export const COOKIE_NAME_ID = "__wr_id";
export const COOKIE_NAME_ADMISSION = "__wr_admission";
export const COOKIE_NAME_DEMO_SIMULATION = "__wr_demo";
