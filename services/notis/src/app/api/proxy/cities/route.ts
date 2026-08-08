import { NextResponse } from "next/server";

/** City list with logos from the main app's public REST API (CORS-avoiding). */
export async function GET() {
  const res = await fetch("https://opencouncil.gr/api/cities", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `cities fetch failed: ${res.status}` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
