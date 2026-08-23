import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasMainDb, mainDb } from "./main-db";
import { cookieCarriesRawToken, sessionCookieName } from "./session-cookie";

/**
 * Shared-cookie admin auth: the browser presents the main app's session
 * credential (see session-cookie.ts for which cookie carries it) and we
 * validate it against the notis_admin_sessions view — superadmin sessions
 * only, by construction of the view. The view exposes a SHA-256 of the
 * token, so nothing Notis handles can be replayed against the main app.
 */

export interface AdminSession {
  userId: string;
  userName: string | null;
}

/** The value to look up in the hashed view for a given cookie. */
export function lookupHashFor(cookieName: string, cookieValue: string): string {
  return cookieCarriesRawToken(cookieName)
    ? createHash("sha256").update(cookieValue).digest("hex")
    : cookieValue;
}

export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  if (!hasMainDb()) return null;
  const jar = await cookies();
  const name = sessionCookieName();
  const value = jar.get(name)?.value;
  if (!value) return null;
  const row = await mainDb().adminSessionRow.findUnique({
    where: { sessionTokenHash: lookupHashFor(name, value) },
  });
  if (!row || row.expires <= new Date()) return null;
  return { userId: row.userId, userName: row.userName };
});

/**
 * Route-handler guard: returns the response to send when the request is not
 * an authenticated superadmin, null when it is. Every non-public API route
 * calls this first — the edge proxy only checks that the cookie exists.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (!hasMainDb()) {
    return NextResponse.json(
      { error: "admin auth unavailable: MAIN_DATABASE_URL is not set" },
      { status: 503 },
    );
  }
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
