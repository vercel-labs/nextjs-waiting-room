import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getIdentityCookieOptions,
  getRequestDestinationPath,
  getSessionUpdateCookieOptions,
} from "@/lib/waiting-room/cookies";
import { resolveProxyAccessDecision } from "@/lib/waiting-room/service";
import { COOKIE_NAME_ID, COOKIE_NAME_TIME } from "@/lib/waiting-room/types";

/**
 * Keep Proxy lean.
 *
 * This file runs on every protected request, so it only extracts request
 * context, delegates policy to the shared service layer, and refreshes
 * session cookies when needed.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const userId = request.cookies.get(COOKIE_NAME_ID)?.value ?? null;
  const nextPath = getRequestDestinationPath(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  const lastUpdate = Number.parseInt(
    request.cookies.get(COOKIE_NAME_TIME)?.value ?? "",
    10
  );
  const decision = await resolveProxyAccessDecision({
    lastUpdate,
    nextPath,
    userId,
  });

  if (decision.status === "redirect") {
    return NextResponse.redirect(new URL(decision.destination, request.url));
  }

  if (decision.status === "renew") {
    event.waitUntil(decision.renewSession());

    const response = NextResponse.next();
    response.cookies.set(
      COOKIE_NAME_ID,
      decision.userId,
      getIdentityCookieOptions(decision.config)
    );
    response.cookies.set(
      COOKIE_NAME_TIME,
      decision.renewedAt.toString(),
      getSessionUpdateCookieOptions(decision.config)
    );
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/demo", "/demo/:path*"],
};
