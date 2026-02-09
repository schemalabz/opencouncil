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
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),
    BASIC_AUTH_USERNAME: z.string().optional(),
    BASIC_AUTH_PASSWORD: z.string().optional(),

    // Services
    ANTHROPIC_API_KEY: z.string().min(1),
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

    // Elasticsearch
    ELASTICSEARCH_URL: z.string().url(),
    ELASTICSEARCH_API_KEY: z.string().min(1),
    ELASTICSEARCH_INDEX: z.string().default('subjects'), // Override for testing (e.g., 'subjects_test')

    // Discord Admin Alerts
    DISCORD_WEBHOOK_URL: z.string().url().optional(),

    // Bird API for WhatsApp/SMS notifications
    BIRD_API_KEY: z.string().min(1).optional(),
    BIRD_WORKSPACE_ID: z.string().optional(),
    BIRD_WHATSAPP_CHANNEL_ID: z.string().optional(),
    BIRD_SMS_CHANNEL_ID: z.string().optional(),
    BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING: z.string().optional(), // Template project ID from Bird Studio
    BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING: z.string().optional(),  // Template project ID from Bird Studio
    BIRD_WHATSAPP_TEMPLATE_WELCOME: z.string().optional(),  // Welcome template when user signs up

    // Google Calendar Integration (OAuth 2.0)
    GOOGLE_CALENDAR_CLIENT_ID: z.string().optional(),
    GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_CALENDAR_ID: z.string().optional(),
    GOOGLE_CALENDAR_ENABLED: z.string().optional(),

    // Development
    DEV_TEST_CITY_ID: z.string().default('chania'),
    DEV_EMAIL_OVERRIDE: z.string().email().optional(),
    SEED_DATA_URL: z.string().url().default('https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/seed_data.json'),
    SEED_DATA_PATH: z.string().default('./prisma/seed_data.json'),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
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
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
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
    ELASTICSEARCH_INDEX: process.env.ELASTICSEARCH_INDEX,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    BIRD_API_KEY: process.env.BIRD_API_KEY,
    BIRD_WORKSPACE_ID: process.env.BIRD_WORKSPACE_ID,
    BIRD_WHATSAPP_CHANNEL_ID: process.env.BIRD_WHATSAPP_CHANNEL_ID,
    BIRD_SMS_CHANNEL_ID: process.env.BIRD_SMS_CHANNEL_ID,
    BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING: process.env.BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING,
    BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING: process.env.BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING,
    BIRD_WHATSAPP_TEMPLATE_WELCOME: process.env.BIRD_WHATSAPP_TEMPLATE_WELCOME,
    GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    GOOGLE_CALENDAR_REFRESH_TOKEN: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_ENABLED: process.env.GOOGLE_CALENDAR_ENABLED,
    DEV_TEST_CITY_ID: process.env.DEV_TEST_CITY_ID,
    DEV_EMAIL_OVERRIDE: process.env.DEV_EMAIL_OVERRIDE,
    SEED_DATA_URL: process.env.SEED_DATA_URL,
    SEED_DATA_PATH: process.env.SEED_DATA_PATH,
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
    const details = issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`❌ Invalid environment variables:\n${details}`);
    throw new Error(`Invalid environment variables:\n${details}`);
  },

  /**
   * Skip validation during builds (e.g., in CI/Nix sandboxes where env vars aren't available).
   * Set SKIP_ENV_VALIDATION=1 to skip.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
}); 