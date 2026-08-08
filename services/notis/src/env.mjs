import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1),
    // Gates /admin and the agent API routes until PR 2 replaces this with
    // shared-cookie validation against the main app's sessions.
    NOTIS_ADMIN_SECRET: z.string().min(16),
  },
  client: {
    // Powers the playground's address search + map. Optional: without it the
    // simulator falls back to free-text location chips.
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),
  },
  runtimeEnv: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NOTIS_ADMIN_SECRET: process.env.NOTIS_ADMIN_SECRET,
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
