import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

const DEFAULT_DEV_SECRET = "waiting-room-dev-secret-change-me";
const TOKEN_VERSION = "v1";

interface AdmissionTokenPayload {
  exp: number;
  sub: string;
}

export interface VerifiedAdmissionToken {
  expiresAt: number;
  userId: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getTokenSecret(): string {
  const secret = process.env.WAITING_ROOM_TOKEN_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_DEV_SECRET;
  }

  throw new Error(
    "[WaitingRoom] WAITING_ROOM_TOKEN_SECRET must be set in production."
  );
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createAdmissionToken(
  userId: string,
  issuedAt = Date.now()
): string {
  const config = getConfig();
  const payload: AdmissionTokenPayload = {
    sub: userId,
    exp: issuedAt + config.sessionTtlSeconds * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export function verifyAdmissionToken(
  token: string | null | undefined,
  now = Date.now()
): VerifiedAdmissionToken | null {
  if (!token) {
    return null;
  }

  const [version, encodedPayload, providedSignature] = token.split(".");
  if (
    version !== TOKEN_VERSION ||
    !encodedPayload ||
    !providedSignature
  ) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload)
    ) as Partial<AdmissionTokenPayload>;

    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp <= now) {
      return null;
    }

    return {
      userId: payload.sub,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
