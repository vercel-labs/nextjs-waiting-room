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
 * Base provider interface.
 *
 * All providers implement this. Providers that don't support FIFO queue
 * ordering set `supportsQueue: false`; the UI adapts accordingly.
 */
export interface WaitingRoomProvider {
  /**
   * Get the count of currently active sessions.
   * Expired sessions are purged before counting.
   */
  getActiveCount(): Promise<number>;

  /**
   * Check if a user has an active session.
   * Called in proxy.ts on every request (~1-3ms Redis EXISTS/HGET).
   */
  hasSession(userId: string): Promise<boolean>;

  /**
   * Renew an active session's TTL.
   * Called via `event.waitUntil()` in proxy — never blocking the response.
   */
  renewSession(userId: string): Promise<void>;
  /**
   * Whether this provider can be used safely from Proxy for session checks.
   *
   * In-memory state is process-local, so proxy and app routes may observe
   * different data during local development.
   */
  readonly supportsProxyVerification: boolean;
  readonly supportsQueue: boolean;

  /**
   * Atomically attempt to admit a user.
   *
   * If capacity is available AND the user is next in queue (for queued
   * providers), the session is created and the user is removed from the
   * queue — all in a single atomic operation.
   *
   * If capacity is full, the user is added to the queue (idempotent via
   * ZADD NX for Redis providers).
   *
   * Returns the result of the attempt.
   */
  tryAdmit(userId: string): Promise<AdmitResult>;
}

/**
 * Extended provider interface for backends that support FIFO queue ordering.
 *
 * Redis-backed providers implement this, enabling position tracking and
 * wait-time estimation in the UI.
 */
export interface QueuedWaitingRoomProvider extends WaitingRoomProvider {
  /**
   * Get an estimated wait time in seconds using a rolling average
   * of recent session durations.
   *
   * Formula: position × avgSessionDuration / capacity
   *
   * Accepts an optional known position so callers can avoid a second
   * queue lookup when they already have the latest rank.
   */
  getEstimatedWait(userId: string, position?: number | null): Promise<number>;

  /**
   * Get the user's current position in the queue (1-indexed).
   * Returns null if the user is not in the queue.
   */
  getPosition(userId: string): Promise<number | null>;
  readonly supportsQueue: true;
}

/**
 * Type guard: check if a provider supports queue operations.
 */
export function isQueuedProvider(
  provider: WaitingRoomProvider
): provider is QueuedWaitingRoomProvider {
  return provider.supportsQueue === true;
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
export const COOKIE_NAME_TIME = "__wr_last_update";
export const COOKIE_NAME_DEMO_SIMULATION = "__wr_demo";
