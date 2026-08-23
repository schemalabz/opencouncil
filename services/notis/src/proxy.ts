import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/session-cookie";

// Coarse gate only, and the belt — not the primary defense. This runs on
// every request (full navigation, RSC, prefetch), so it cannot depend on the
// panel layout, which Next.js does not re-run on an RSC soft-navigation. But
// the edge runtime has no database access, so it can only check that the
// cookie is present, never that its value is a live superadmin session.
// Real validation happens server-side, where the database is reachable:
// getAdminSession() in the panel layout AND in every panel page body (a
// segment RSC request skips the layout — see the (panel) auth-guard test),
// and requireAdmin() in every API route.
const PUBLIC_API = ["/api/health"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  if (request.cookies.get(sessionCookieName())?.value) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const login = request.nextUrl.clone();
  login.pathname = "/admin/login";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
