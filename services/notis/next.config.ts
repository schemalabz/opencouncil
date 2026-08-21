import type { NextConfig } from "next";
import path from "node:path";
import "./src/env.mjs";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Nix preview deployments (same pattern
  // as the main app).
  output: "standalone",
  transpilePackages: ["@opencouncil/ui"],
  // Pin the workspace root: without this, Next walks up looking for lockfiles
  // and can pick a stray one outside the repo (e.g. ~/package-lock.json),
  // which breaks module resolution and instrumentation lookup.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
