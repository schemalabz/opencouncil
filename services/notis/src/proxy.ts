import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/session-cookie";

// Coarse gate only: a request without the main app's session cookie cannot be
// authenticated, so bounce it here for fast UX. Real validation (the token
// exists in notis_admin_sessions and has not expired) happens server-side —
// getAdminSession() in the panel layout, requireAdmin() in every API route —
// because the edge runtime has no database access.
// The Bird webhook carries no session cookie; it authenticates with its own
// HMAC signature inside the route.
const PUBLIC_API = ["/api/health", "/api/webhooks/bird"];

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
