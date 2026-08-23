import fs from "fs";
import path from "path";

/**
 * Smoke test for the Notis admin panel auth model.
 *
 * The (panel) layout's getAdminSession() guard does not re-run on an RSC
 * soft-navigation, and the edge proxy only checks that the session cookie
 * exists (it cannot reach the database to validate it). So the layout cannot
 * be the only gate: every server-component page under (panel) must re-assert
 * a check in its own body. A page that renders no server data of its own may
 * instead be a "use client" page — its data comes from API routes, which each
 * call requireAdmin(). This test fails when a new unguarded panel page lands.
 *
 * The API routes get the same default-deny treatment: the mirror cookie is
 * set for EVERY signed-in main-app user, not just superadmins, and the edge
 * proxy checks only that it exists — so one route.ts shipped without
 * requireAdmin() is an open endpoint. Every route must call requireAdmin()
 * unless it is on the deliberate public list (health; the Bird webhook,
 * which authenticates with its own HMAC signature).
 *
 * Mirrors src/lib/__tests__/admin-auth-guard.test.ts in the main app.
 */

const PANEL_DIR = path.join(__dirname, "..");

const GUARD = /getAdminSession|requireAdmin/;
const USE_CLIENT = /^\s*['"]use client['"]/;

function findPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === "__tests__") continue;
    if (entry.isDirectory()) findPages(full, out);
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(PANEL_DIR, file).split(path.sep).join("/");
}

const APP_DIR = path.join(__dirname, "..", "..", "..");

/** Deliberately public routes, each with its own auth story. */
const PUBLIC_ROUTES = new Set([
  "api/health/route.ts", // static liveness probe, no data
  "api/webhooks/bird/route.ts", // HMAC-signed by Bird, not session-authed
]);

function findRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findRoutes(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("notis (panel) auth guard", () => {
  it("has panel pages to scan", () => {
    expect(findPages(PANEL_DIR).length).toBeGreaterThan(4);
  });

  it("every panel page re-asserts a guard or is a client page", () => {
    const unguarded: string[] = [];

    for (const page of findPages(PANEL_DIR)) {
      const source = fs.readFileSync(page, "utf8");
      const isClient = source
        .split("\n")
        .slice(0, 3)
        .some((l) => USE_CLIENT.test(l));
      if (isClient) continue; // data comes from guarded API routes
      if (GUARD.test(source)) continue; // re-asserts auth in the page body
      unguarded.push(rel(page));
    }

    expect({ unguarded }).toEqual({ unguarded: [] });
  });

  it("every API route calls requireAdmin or is deliberately public", () => {
    const unguarded: string[] = [];
    for (const route of findRoutes(APP_DIR)) {
      const rel = path.relative(APP_DIR, route).split(path.sep).join("/");
      if (PUBLIC_ROUTES.has(rel)) continue;
      const source = fs.readFileSync(route, "utf8");
      if (/requireAdmin/.test(source)) continue;
      unguarded.push(rel);
    }
    expect({ unguarded }).toEqual({ unguarded: [] });
  });
});
