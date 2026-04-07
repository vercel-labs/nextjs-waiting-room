import { Redis } from "@upstash/redis";
import { getConfig, keyFor } from "../config";
import { TRY_ADMIT_LUA } from "../lua/try-admit";
import type { AdmitResult, QueuedWaitingRoomProvider } from "../types";

// ------------------------------------------------------------------
// Lua script for atomic admission.
//
// Why a Lua script?
//   The admission check (purge expired → count active → admit or enqueue)
//   MUST be atomic. Without it, concurrent requests can each read
//   "activeCount < capacity" and all get admitted — blowing past the limit.
//   Redis executes Lua scripts in a single, uninterruptible step.
//
// Why EVALSHA instead of EVAL?
//   EVAL sends the full script text on every call. EVALSHA sends only the
//   script's SHA-1 hash — Redis looks up the cached script server-side.
//   This is both a performance and a hardening win:
//     1. Less data over the wire on every request
//     2. The script is loaded once, then referenced by hash — no raw Lua
//        source is transmitted after the first call
//     3. Compatible with Redis ACLs that allow EVALSHA but block EVAL
//
// Security note:
//   User input (userId, timestamps, config) is NEVER interpolated into
//   the script. All dynamic values are passed via KEYS[] and ARGV[],
//   which Redis treats as data — not executable code. This is the Lua
//   equivalent of parameterized SQL queries.
// ------------------------------------------------------------------
export class UpstashRedisProvider implements QueuedWaitingRoomProvider {
  readonly supportsProxyVerification = true as const;
  readonly supportsQueue = true as const;
  private readonly redis: Redis;
  // Upstash Script: .exec() tries EVALSHA first, falls back to EVAL on cache miss,
  // then all subsequent calls use the cached SHA — no full script retransmission.
  private readonly tryAdmitScript: ReturnType<
    typeof Redis.prototype.createScript<[number, number]>
  >;

  constructor(redis?: Redis) {
    this.redis = redis ?? Redis.fromEnv();
    this.tryAdmitScript =
      this.redis.createScript<[number, number]>(TRY_ADMIT_LUA);
  }

  async hasSession(userId: string): Promise<boolean> {
    const expiry = await this.redis.hget<number>(keyFor("active"), userId);
    return expiry !== null && expiry > Date.now();
  }

  async renewSession(userId: string): Promise<void> {
    const config = getConfig();
    const newExpiryMs = Date.now() + config.sessionTtlSeconds * 1000;
    await this.redis.hset(keyFor("active"), { [userId]: newExpiryMs });
  }

  async tryAdmit(userId: string): Promise<AdmitResult> {
    const config = getConfig();
    const [status, position] = await this.tryAdmitScript.exec(
      [keyFor("active"), keyFor("queue"), keyFor("durations")],
      [
        config.capacity.toString(),
        userId,
        Date.now().toString(),
        (config.sessionTtlSeconds * 1000).toString(),
        (config.queueTtlSeconds * 1000).toString(),
      ]
    );

    switch (status) {
      case 1:
        return { status: "admitted" };
      case 2:
        return { status: "queued", position };
      case 3:
        return { status: "already_active" };
      default:
        throw new Error(
          `[WaitingRoom] Unexpected Lua script status: ${status}`
        );
    }
  }

  async getActiveCount(): Promise<number> {
    const active = await this.redis.hgetall<Record<string, number>>(
      keyFor("active")
    );
    if (!active) {
      return 0;
    }

    const now = Date.now();
    const expired = Object.entries(active)
      .filter(([, expiry]) => expiry <= now)
      .map(([uid]) => uid);

    if (expired.length > 0) {
      await this.redis.hdel(keyFor("active"), ...expired);
    }

    return Object.keys(active).length - expired.length;
  }

  async getPosition(userId: string): Promise<number | null> {
    const rank = await this.redis.zrank(keyFor("queue"), userId);
    if (rank === null) {
      return null;
    }
    return rank + 1;
  }

  async getEstimatedWait(
    userId: string,
    position?: number | null
  ): Promise<number> {
    const resolvedPosition =
      position === undefined ? await this.getPosition(userId) : position;

    if (resolvedPosition === null) {
      return -1;
    }

    const config = getConfig();
    const durations = await this.redis.lrange<number>(
      keyFor("durations"),
      -100,
      -1
    );

    let avgDurationMs: number;
    if (durations.length > 0) {
      avgDurationMs =
        durations.reduce((sum, d) => sum + d, 0) / durations.length;
    } else {
      avgDurationMs = config.sessionTtlSeconds * 1000;
    }

    return (resolvedPosition * avgDurationMs) / (config.capacity * 1000);
  }
}
