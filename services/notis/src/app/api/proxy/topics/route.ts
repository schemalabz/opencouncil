import { NextResponse } from "next/server";

/** Live topic taxonomy from the main app (Greek labels, matching MCP filters). */
export async function GET() {
  const res = await fetch("https://opencouncil.gr/api/topics", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `topics fetch failed: ${res.status}` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
