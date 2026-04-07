import { type NextRequest, NextResponse } from "next/server";
import { resolveConfig } from "@/lib/waiting-room/config";
import { getIdentityCookieOptions } from "@/lib/waiting-room/cookies";
import { parseDemoSimulationState } from "@/lib/waiting-room/demo-simulation";
import { resolveWaitingRoomStatus } from "@/lib/waiting-room/service";
import type {
  WaitingRoomConfig,
  WaitingRoomStatus,
} from "@/lib/waiting-room/types";
import {
  COOKIE_NAME_DEMO_SIMULATION,
  COOKIE_NAME_ID,
} from "@/lib/waiting-room/types";

export const dynamic = "force-dynamic";

/**
 * Polling endpoint for queued browsers.
 *
 * It returns one discriminated union and refreshes the identity cookie so long
 * waits do not accidentally lose queue identity.
 */
function createStatusResponse(
  status: WaitingRoomStatus,
  userId: string,
  config: WaitingRoomConfig
): NextResponse {
  const response = NextResponse.json(status, {
    status: status.status === "unavailable" ? 503 : 200,
  });
  response.cookies.set(
    COOKIE_NAME_ID,
    userId,
    getIdentityCookieOptions(config)
  );
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.cookies.get(COOKIE_NAME_ID)?.value;
  const simulation = parseDemoSimulationState(
    request.cookies.get(COOKIE_NAME_DEMO_SIMULATION)?.value
  );

  if (!userId) {
    return NextResponse.json({ error: "No session cookie" }, { status: 400 });
  }

  const [config, status] = await Promise.all([
    resolveConfig(),
    resolveWaitingRoomStatus(userId, "status route", simulation),
  ]);

  return createStatusResponse(status, userId, config);
}
