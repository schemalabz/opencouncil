import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),

    // Database Initialization (for local Docker setup)
    DATABASE_USER: z.string().optional(),
    DATABASE_PASSWORD: z.string().optional(),
    DATABASE_NAME: z.string().optional(),

    // Auth
    RESEND_API_KEY: z.string().min(1),
    BASIC_AUTH_USERNAME: z.string().optional(),
    BASIC_AUTH_PASSWORD: z.string().optional(),

    // Services
    ANTHROPIC_API_KEY: z.string().min(1),
    VOYAGE_API_KEY: z.string().min(1),
    VOYAGE_API_BASE_URL: z
      .string()
      .url()
      .default("https://api.voyageai.com/v1"),
    GOOGLE_API_KEY: z.string().min(1),

    // Storage
    DO_SPACES_ENDPOINT: z.string().min(1),
    DO_SPACES_KEY: z.string().min(1),
    DO_SPACES_SECRET: z.string().min(1),
    DO_SPACES_BUCKET: z.string().min(1),
    CDN_URL: z.string().url(),

    // Task Server
    TASK_API_URL: z.string().url(),
    TASK_API_KEY: z.string().min(1),

    // Other
    ELASTICSEARCH_URL: z.string().url(),
    ELASTICSEARCH_API_KEY: z.string().min(1),

    // Development
    DEV_TEST_CITY_ID: z.string().default('chania'),
    SEED_DATA_URL: z.string().url().default('https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/seed_data.json'),
    SEED_DATA_PATH: z.string().default('./prisma/seed_data.json'),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
    NEXT_PUBLIC_URL: z.string().url(),
    NEXT_PUBLIC_MAIN_DOMAIN: z.string(),
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().min(1),
    NEXT_PUBLIC_CONTACT_PHONE: z.string().optional(),
    NEXT_PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
    NEXT_PUBLIC_CONTACT_ADDRESS: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    DATABASE_USER: process.env.DATABASE_USER,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
    DATABASE_NAME: process.env.DATABASE_NAME,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
    VOYAGE_API_BASE_URL: process.env.VOYAGE_API_BASE_URL,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,
    DO_SPACES_KEY: process.env.DO_SPACES_KEY,
    DO_SPACES_SECRET: process.env.DO_SPACES_SECRET,
    DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET,
    CDN_URL: process.env.CDN_URL,
    TASK_API_URL: process.env.TASK_API_URL,
    TASK_API_KEY: process.env.TASK_API_KEY,
    ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
    ELASTICSEARCH_API_KEY: process.env.ELASTICSEARCH_API_KEY,
    DEV_TEST_CITY_ID: process.env.DEV_TEST_CITY_ID,
    SEED_DATA_URL: process.env.SEED_DATA_URL,
    SEED_DATA_PATH: process.env.SEED_DATA_PATH,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_MAIN_DOMAIN: process.env.NEXT_PUBLIC_MAIN_DOMAIN,
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN:
      process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    NEXT_PUBLIC_CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    NEXT_PUBLIC_CONTACT_ADDRESS: process.env.NEXT_PUBLIC_CONTACT_ADDRESS,
  },

  /**
   * Called when the schema validation fails.
   * @see https://env.t3.gg/docs/customization#overriding-the-default-error-handler
   */
  onValidationError: (issues) => {
    console.error("❌ Invalid environment variables:");
    for (const issue of issues) {
      const path = issue.path.join(".");
      const message = issue.message;
      console.error(`  - ${path}: ${message}`);
    }
    console.error("\nPlease fix them in your .env file and try again.");
    process.exit(1);
  },
}); 