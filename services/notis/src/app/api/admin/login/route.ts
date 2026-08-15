import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, mintToken, timingSafeEqual } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/api";
import { env } from "@/env.mjs";

const bodySchema = z.object({ secret: z.string().min(1) });

// Naive in-memory throttle: 5 attempts per minute per process. Good enough
// for a single-instance interim gate; goes away with PR 2's cookie auth.
let attempts: number[] = [];

export async function POST(request: NextRequest) {
  const now = Date.now();
  attempts = attempts.filter((t) => now - t < 60_000);
  if (attempts.length >= 5) {
    return NextResponse.json({ error: "too many attempts, wait a minute" }, { status: 429 });
  }

  const { data, error } = await parseJsonBody(request, bodySchema);
  if (error) return error;

  if (!timingSafeEqual(data.secret, env.NOTIS_ADMIN_SECRET)) {
    // Only failed guesses consume the budget — 5 successful logins in a
    // minute must not lock the admin out.
    attempts.push(now);
    return NextResponse.json({ error: "wrong secret" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: await mintToken(env.NOTIS_ADMIN_SECRET),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
