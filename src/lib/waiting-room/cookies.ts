import type { WaitingRoomConfig } from "./types";

export const PROTECTED_DEMO_PATH = "/demo";
export const DEFAULT_AFTER_WAITING_ROOM_PATH = PROTECTED_DEMO_PATH;
export const WAITING_ROOM_PATH = "/waiting-room";
export const WAITING_ROOM_INIT_PATH = "/api/waiting-room/init";

const COOKIE_PATH = "/";

export function getIdentityCookieMaxAge(config: WaitingRoomConfig): number {
  return Math.max(config.sessionTtlSeconds, config.queueTtlSeconds);
}

export function getIdentityCookieOptions(config: WaitingRoomConfig) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: getIdentityCookieMaxAge(config),
  };
}

export function getAdmissionCookieOptions(config: WaitingRoomConfig) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: config.sessionTtlSeconds,
  };
}

export function getDemoSimulationCookieOptions(config: WaitingRoomConfig) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: config.queueTtlSeconds,
  };
}

export function getWaitingRoomPath(
  nextPath = DEFAULT_AFTER_WAITING_ROOM_PATH
): string {
  const searchParams = new URLSearchParams({
    next: getSafeRedirectPath(nextPath, DEFAULT_AFTER_WAITING_ROOM_PATH),
  });

  return `${WAITING_ROOM_PATH}?${searchParams.toString()}`;
}

export function getWaitingRoomInitPath(
  nextPath = DEFAULT_AFTER_WAITING_ROOM_PATH
): string {
  const searchParams = new URLSearchParams({
    next: getSafeRedirectPath(nextPath, DEFAULT_AFTER_WAITING_ROOM_PATH),
  });
  return `${WAITING_ROOM_INIT_PATH}?${searchParams.toString()}`;
}

/**
 * Prevent open redirects by only allowing same-origin absolute paths.
 */
export function getSafeRedirectPath(
  nextPath: string | null | undefined,
  fallbackPath = DEFAULT_AFTER_WAITING_ROOM_PATH
): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) {
    return fallbackPath;
  }

  return nextPath;
}

export function getRequestDestinationPath(pathname: string, search: string) {
  if (!search) {
    return pathname;
  }

  return `${pathname}${search}`;
}
