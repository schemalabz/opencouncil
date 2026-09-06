import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

/**
 * Service-to-service auth for the routes the main app calls on a reader's
 * behalf (the subscriptions API behind the profile switch). A shared bearer
 * token, compared in constant time; never a cookie — the browser is not a
 * party to these calls, and the mirror cookie belongs to whoever is signed
 * in, not to the service.
 *
 * Fails closed: without NOTIS_SERVICE_TOKEN the route answers 503, so a
 * deployment that forgot the secret exposes nothing.
 */

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function tokensMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * Route-handler guard: the response to send when the request does not carry
 * the service token, null when it does.
 */
export function requireService(request: Request): NextResponse | null {
  const expected = env.NOTIS_SERVICE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "service auth unavailable: NOTIS_SERVICE_TOKEN is not set" },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!presented || !tokensMatch(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
