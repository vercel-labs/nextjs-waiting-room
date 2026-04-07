import { type NextRequest, NextResponse } from "next/server";
import { resolveConfig } from "@/lib/waiting-room/config";
import {
  DEFAULT_AFTER_WAITING_ROOM_PATH,
  getAdmissionCookieOptions,
  getDemoSimulationCookieOptions,
  getIdentityCookieOptions,
  getSafeRedirectPath,
  getWaitingRoomPath,
} from "@/lib/waiting-room/cookies";
import {
  createDemoSimulationState,
  serializeDemoSimulationState,
} from "@/lib/waiting-room/demo-simulation";
import {
  COOKIE_NAME_ADMISSION,
  COOKIE_NAME_DEMO_SIMULATION,
  COOKIE_NAME_ID,
} from "@/lib/waiting-room/types";

export const dynamic = "force-dynamic";

/**
 * Establish the stable waiting-room identity cookie before the user lands on
 * the waiting-room page. The rest of the flow keys off this ID.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = await resolveConfig();
  const userId =
    request.cookies.get(COOKIE_NAME_ID)?.value ?? crypto.randomUUID();
  const nextPath = getSafeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    DEFAULT_AFTER_WAITING_ROOM_PATH
  );
  const simulation = createDemoSimulationState({
    peopleAhead: Number.parseInt(
      request.nextUrl.searchParams.get("ahead") ?? "0",
      10
    ),
    slotIntervalSeconds: Number.parseInt(
      request.nextUrl.searchParams.get("pace") ?? "0",
      10
    ),
  });

  const response = NextResponse.redirect(
    new URL(getWaitingRoomPath(nextPath), request.url)
  );
  response.cookies.set(
    COOKIE_NAME_ID,
    userId,
    getIdentityCookieOptions(config)
  );
  response.cookies.set(COOKIE_NAME_ADMISSION, "", {
    ...getAdmissionCookieOptions(config),
    maxAge: 0,
  });

  const serializedSimulation = serializeDemoSimulationState(simulation);
  if (serializedSimulation) {
    response.cookies.set(
      COOKIE_NAME_DEMO_SIMULATION,
      serializedSimulation,
      getDemoSimulationCookieOptions(config)
    );
  } else {
    response.cookies.set(COOKIE_NAME_DEMO_SIMULATION, "", {
      ...getDemoSimulationCookieOptions(config),
      maxAge: 0,
    });
  }

  return response;
}
