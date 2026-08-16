// Test stand-in for src/env.mjs (an ESM file jest's ts-jest transform does
// not parse). Reads process.env at import time so tests can vary values via
// jest.isolateModules — EXCEPT the database URLs: the generated Prisma client
// auto-loads .env on import (before this mock is evaluated), which would put
// the developer's real database URLs back into process.env after jest.setup.js
// cleared them. Unit tests never touch a database, so they stay undefined.
export const env = {
  ANTHROPIC_API_KEY: "test-key",
  NOTIS_MCP_URL: "https://opencouncil.gr/mcp",
  OPENCOUNCIL_BASE_URL: process.env.OPENCOUNCIL_BASE_URL ?? "https://opencouncil.gr",
  NOTIS_DATABASE_URL: undefined,
  MAIN_DATABASE_URL: undefined,
  MAIN_SESSION_COOKIE_NAME: process.env.MAIN_SESSION_COOKIE_NAME,
  NOTIS_ALERT_WEBHOOK_URL: undefined,
  BIRD_API_KEY: process.env.BIRD_API_KEY,
  BIRD_WORKSPACE_ID: process.env.BIRD_WORKSPACE_ID,
  BIRD_WHATSAPP_CHANNEL_ID: process.env.BIRD_WHATSAPP_CHANNEL_ID,
  BIRD_WEBHOOK_SECRET: process.env.BIRD_WEBHOOK_SECRET,
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: undefined,
};
