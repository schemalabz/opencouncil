import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env.mjs";

/**
 * Shared plumbing for the API routes: JSON-body validation and uniform
 * upstream-failure responses, so every route reports errors the same way.
 */

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error?: never } | { data?: never; error: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: "invalid request", issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data as z.infer<S> };
}

/**
 * Upstream-failure response. Keeps the upstream status and message visible —
 * the playground's only debugging surface is this body — and logs the full
 * error server-side so a 429 and an MCP outage stop looking identical.
 */
export function errorResponse(error: unknown): NextResponse {
  console.error("[notis:api]", error);
  const status =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
  const message = error instanceof Error ? error.message : "request failed";
  return NextResponse.json({ error: message }, { status });
}

/** GET pass-through to the main app's public REST API (CORS-avoiding). */
export async function proxyOpencouncilGet(apiPath: string): Promise<NextResponse> {
  const res = await fetch(`${env.OPENCOUNCIL_BASE_URL}/api/${apiPath}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `${apiPath} fetch failed: ${res.status}` },
      { status: 502 },
    );
  }
  return NextResponse.json(await res.json());
}
