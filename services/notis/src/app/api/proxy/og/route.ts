import { NextRequest, NextResponse } from "next/server";

/**
 * OG metadata for opencouncil.gr links, so the playground chat can render
 * WhatsApp-style link previews. Server-side to avoid CORS; locked to the
 * opencouncil.gr domain.
 */

function pick(html: string, prop: string): string | undefined {
  const a = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"),
  );
  if (a?.[1]) return decode(a[1]);
  const b = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"),
  );
  return b?.[1] ? decode(b[1]) : undefined;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (!/(^|\.)opencouncil\.gr$/.test(url.hostname) || url.protocol !== "https:") {
    return NextResponse.json({ error: "only opencouncil.gr links" }, { status: 400 });
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    headers: { "User-Agent": "WhatsApp/2.23.20 (playground preview)" },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: 502 });
  }
  const html = (await res.text()).slice(0, 200_000);

  return NextResponse.json({
    title: pick(html, "og:title") ?? decode(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? ""),
    description: pick(html, "og:description"),
    image: pick(html, "og:image"),
    host: url.hostname,
  });
}
