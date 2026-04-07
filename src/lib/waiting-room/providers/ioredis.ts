import Redis from "ioredis";
import { getConfig, keyFor } from "../config";
import { TRY_ADMIT_LUA } from "../lua/try-admit";
import type { AdmitResult, QueuedWaitingRoomProvider } from "../types";

// See upstash.ts for the full explanation of why this script exists,
// why EVALSHA is preferred over EVAL, and the security model.

// ioredis `defineCommand` registers the script via SCRIPT LOAD on first call,
// then uses EVALSHA for all subsequent calls — same hardening as Upstash's
// createScript but via the native Redis TCP protocol.
const COMMAND_NAME = "tryAdmit";

export class IORedisProvider implements QueuedWaitingRoomProvider {
  readonly supportsProxyVerification = true as const;
  readonly supportsQueue = true as const;
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis =
      redis ?? new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

    this.redis.defineCommand(COMMAND_NAME, {
      lua: TRY_ADMIT_LUA,
      numberOfKeys: 3,
    });
  }

  async hasSession(userId: string): Promise<boolean> {
    const expiry = await this.redis.hget(keyFor("active"), userId);
    return expiry !== null && Number(expiry) > Date.now();
  }

  async renewSession(userId: string): Promise<void> {
    const config = getConfig();
    const newExpiryMs = Date.now() + config.sessionTtlSeconds * 1000;
    await this.redis.hset(keyFor("active"), userId, newExpiryMs.toString());
  }

  async tryAdmit(userId: string): Promise<AdmitResult> {
    const config = getConfig();
    const sessionTtlMs = config.sessionTtlSeconds * 1000;
    const queueTtlMs = config.queueTtlSeconds * 1000;

    // ioredis attaches the defined command as a method on the instance.
    // The call signature matches: (key1, key2, key3, arg1, arg2, ...).
    const result = await (
      this.redis as Redis & {
        tryAdmit: (...args: string[]) => Promise<[number, number]>;
      }
    ).tryAdmit(
      keyFor("active"),
      keyFor("queue"),
      keyFor("durations"),
      config.capacity.toString(),
      userId,
      Date.now().toString(),
      sessionTtlMs.toString(),
      queueTtlMs.toString()
    );

    const [status, position] = result;

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
    const active = await this.redis.hgetall(keyFor("active"));
    const now = Date.now();
    const expired = Object.entries(active)
      .filter(([, expiry]) => Number(expiry) <= now)
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
    const durations = await this.redis.lrange(keyFor("durations"), -100, -1);

    let avgDurationMs: number;
    if (durations.length > 0) {
      avgDurationMs =
        durations.reduce((sum, d) => sum + Number(d), 0) / durations.length;
    } else {
      avgDurationMs = config.sessionTtlSeconds * 1000;
    }

    return (resolvedPosition * avgDurationMs) / (config.capacity * 1000);
  }
}
