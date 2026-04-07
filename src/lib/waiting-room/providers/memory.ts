import { getConfig } from "../config";
import type { AdmitResult, WaitingRoomProvider } from "../types";

interface Session {
  expiryMs: number;
}

export class InMemoryProvider implements WaitingRoomProvider {
  private readonly sessions = new Map<string, Session>();
  private readonly queue: string[] = [];

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[WaitingRoom] InMemoryProvider cannot be used in production. " +
          "Set WAITING_ROOM_PROVIDER=upstash or WAITING_ROOM_PROVIDER=ioredis."
      );
    }
    if (process.env.VERCEL_REGION) {
      console.warn(
        "[WaitingRoom] InMemoryProvider detected VERCEL_REGION env var. " +
          "Multi-instance deployments will have inconsistent state."
      );
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiryMs <= now) {
        this.sessions.delete(id);
      }
    }

    // Queue TTL enforcement is a no-op here — join timestamps aren't tracked
    // in-memory. Redis providers handle this via ZREMRANGEBYSCORE.
  }

  hasSession(userId: string): Promise<boolean> {
    this.purgeExpired();
    const session = this.sessions.get(userId);
    return Promise.resolve(
      session !== undefined && session.expiryMs > Date.now()
    );
  }

  renewSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session && session.expiryMs > Date.now()) {
      session.expiryMs = Date.now() + getConfig().sessionTtlSeconds * 1000;
    }
    return Promise.resolve();
  }

  tryAdmit(userId: string): Promise<AdmitResult> {
    this.purgeExpired();
    const config = getConfig();

    const existing = this.sessions.get(userId);
    if (existing && existing.expiryMs > Date.now()) {
      return Promise.resolve({ status: "already_active" });
    }

    if (this.sessions.size < config.capacity) {
      this.sessions.set(userId, {
        expiryMs: Date.now() + config.sessionTtlSeconds * 1000,
      });
      const queueIdx = this.queue.indexOf(userId);
      if (queueIdx !== -1) {
        this.queue.splice(queueIdx, 1);
      }
      return Promise.resolve({ status: "admitted" });
    }

    if (!this.queue.includes(userId)) {
      this.queue.push(userId);
    }
    const position = this.queue.indexOf(userId) + 1;
    return Promise.resolve({ status: "queued", position });
  }

  getActiveCount(): Promise<number> {
    this.purgeExpired();
    return Promise.resolve(this.sessions.size);
  }
}
