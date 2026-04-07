import { NextResponse } from "next/server";
import { getProvider, resolveProviderName } from "@/lib/waiting-room";
import { resolveConfig } from "@/lib/waiting-room/config";

export const dynamic = "force-dynamic";

/**
 * Demo-only endpoint for the landing page.
 *
 * The core waiting-room flow does not depend on this route.
 */
export async function GET() {
  try {
    const [config, provider] = await Promise.all([
      resolveConfig(),
      getProvider(),
    ]);
    const activeCount = await provider.getActiveCount();
    return NextResponse.json({
      activeCount,
      capacity: config.capacity,
      provider: resolveProviderName(),
    });
  } catch {
    return NextResponse.json(
      { activeCount: 0, capacity: 0, provider: "unavailable" },
      { status: 503 }
    );
  }
}
