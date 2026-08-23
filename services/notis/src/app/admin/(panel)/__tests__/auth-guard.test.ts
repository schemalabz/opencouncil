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
});
