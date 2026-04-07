import { InMemoryProvider } from "./providers/memory";
import type { WaitingRoomProvider } from "./types";

export type WaitingRoomProviderName = "upstash" | "ioredis" | "memory";

// The rest of the app depends on the provider interface, not a concrete Redis
// client. Dynamic imports keep the runtime-specific code isolated here.
let _providerPromise: Promise<WaitingRoomProvider> | null = null;

export function resolveProviderName(): WaitingRoomProviderName {
  const providerName = process.env.WAITING_ROOM_PROVIDER ?? "memory";

  if (
    providerName === "upstash" ||
    providerName === "ioredis" ||
    providerName === "memory"
  ) {
    return providerName;
  }

  throw new Error(
    `[WaitingRoom] Unknown provider "${providerName}". ` +
      "Valid options: upstash, ioredis, memory"
  );
}

export async function createProvider(
  providerName = resolveProviderName()
): Promise<WaitingRoomProvider> {
  switch (providerName) {
    case "upstash": {
      const { UpstashRedisProvider } = await import("./providers/upstash");
      return new UpstashRedisProvider();
    }
    case "ioredis": {
      const { IORedisProvider } = await import("./providers/ioredis");
      return new IORedisProvider();
    }
    case "memory":
      return new InMemoryProvider();
    default:
      throw new Error(`[WaitingRoom] Unsupported provider "${providerName}".`);
  }
}

export function getProvider(): Promise<WaitingRoomProvider> {
  if (!_providerPromise) {
    _providerPromise = createProvider();
  }

  return _providerPromise;
}
