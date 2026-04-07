import Redis from "ioredis";
import { getConfig, keyFor } from "../config";
import { TRY_ADMIT_LUA } from "../lua/try-admit";
import type { AdmitResult, WaitingRoomProvider } from "../types";

// See upstash.ts for the full explanation of why this script exists,
// why EVALSHA is preferred over EVAL, and the security model.

// ioredis `defineCommand` registers the script via SCRIPT LOAD on first call,
// then uses EVALSHA for all subsequent calls — same hardening as Upstash's
// createScript but via the native Redis TCP protocol.
const COMMAND_NAME = "tryAdmit";

export class IORedisProvider implements WaitingRoomProvider {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis =
      redis ?? new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

    this.redis.defineCommand(COMMAND_NAME, {
      lua: TRY_ADMIT_LUA,
      numberOfKeys: 4,
    });
  }

  async hasSession(userId: string): Promise<boolean> {
    const expiry = await this.redis.zscore(keyFor("active"), userId);
    return expiry !== null && Number(expiry) > Date.now();
  }

  async renewSession(userId: string): Promise<void> {
    const config = getConfig();
    const newExpiryMs = Date.now() + config.sessionTtlSeconds * 1000;
    await this.redis.zadd(keyFor("active"), newExpiryMs.toString(), userId);
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
      keyFor("heartbeats"),
      keyFor("ticket-seq"),
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
    await this.redis.zremrangebyscore(
      keyFor("active"),
      "-inf",
      Date.now().toString()
    );
    return this.redis.zcard(keyFor("active"));
  }
}
