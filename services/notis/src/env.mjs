import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1),
    // Gates /admin and the agent API routes until PR 2 replaces this with
    // shared-cookie validation against the main app's sessions.
    NOTIS_ADMIN_SECRET: z.string().min(16),
  },
  client: {},
  runtimeEnv: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NOTIS_ADMIN_SECRET: process.env.NOTIS_ADMIN_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
