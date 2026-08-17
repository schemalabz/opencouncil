import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1),
    // The MCP endpoint the agent researches against. Must be publicly
    // reachable (the MCP connector calls it from Anthropic's side); override
    // to point wakes at a preview deployment.
    NOTIS_MCP_URL: z.string().url().default("https://opencouncil.gr/mcp"),
    // Base URL of the main OpenCouncil app, for the REST proxies (cities, topics).
    OPENCOUNCIL_BASE_URL: z.string().url().default("https://opencouncil.gr"),
    // Notis's own database. Optional: without it the service runs in the
    // stateless playground-only mode (admin panel shows honest zeros).
    NOTIS_DATABASE_URL: z.string().url().optional(),
    // Main-database connection for the notis_* views, as a login user in the
    // notis_reader role. Optional: without it cookie auth fails closed and
    // the playground hides the real-user picker.
    MAIN_DATABASE_URL: z.string().url().optional(),
    // Override for the main app's session cookie name. Defaults per
    // environment; see src/lib/session-cookie.ts.
    MAIN_SESSION_COOKIE_NAME: z.string().optional(),
    // Webhook (e.g. Discord) for operational alarms — janitor refusals and
    // failures. Optional: without it alarms only reach the logs.
    NOTIS_ALERT_WEBHOOK_URL: z.string().url().optional(),
    // Bird (WhatsApp). Notis has its OWN webhook subscription and signing
    // key, separate from the main app's — both subscriptions receive all
    // conversation events during rollout and each service filters to the
    // users it serves. All optional: without them inbound webhooks are
    // rejected in production and outbound sends fail visibly.
    BIRD_API_KEY: z.string().optional(),
    BIRD_WORKSPACE_ID: z.string().optional(),
    BIRD_WHATSAPP_CHANNEL_ID: z.string().optional(),
    // Needed to RECOGNIZE (and ignore) SMS conversation events — the
    // workspace-wide subscription delivers them and an unmatched channel id
    // classifies as WhatsApp by default.
    BIRD_SMS_CHANNEL_ID: z.string().optional(),
    BIRD_WEBHOOK_SECRET: z.string().optional(),
    // Bird template project ids (UUIDs from the Bird dashboard), one per
    // approved demos_* shell. A cold send with a missing id fails visibly.
    // demos_checkin has no send path and deliberately no id.
    BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION: z.string().optional(),
    BIRD_WHATSAPP_TEMPLATE_DEMOS_INTRO: z.string().optional(),
    BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_AGENDA: z.string().optional(),
    BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS: z.string().optional(),
    BIRD_WHATSAPP_TEMPLATE_DEMOS_FOLLOWUP: z.string().optional(),
  },
  client: {
    // Powers the playground's address search + map. Optional: without it the
    // simulator falls back to free-text location chips.
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),
  },
  runtimeEnv: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NOTIS_MCP_URL: process.env.NOTIS_MCP_URL,
    OPENCOUNCIL_BASE_URL: process.env.OPENCOUNCIL_BASE_URL,
    NOTIS_DATABASE_URL: process.env.NOTIS_DATABASE_URL,
    MAIN_DATABASE_URL: process.env.MAIN_DATABASE_URL,
    MAIN_SESSION_COOKIE_NAME: process.env.MAIN_SESSION_COOKIE_NAME,
    NOTIS_ALERT_WEBHOOK_URL: process.env.NOTIS_ALERT_WEBHOOK_URL,
    BIRD_API_KEY: process.env.BIRD_API_KEY,
    BIRD_WORKSPACE_ID: process.env.BIRD_WORKSPACE_ID,
    BIRD_WHATSAPP_CHANNEL_ID: process.env.BIRD_WHATSAPP_CHANNEL_ID,
    BIRD_SMS_CHANNEL_ID: process.env.BIRD_SMS_CHANNEL_ID,
    BIRD_WEBHOOK_SECRET: process.env.BIRD_WEBHOOK_SECRET,
    BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION: process.env.BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION,
    BIRD_WHATSAPP_TEMPLATE_DEMOS_INTRO: process.env.BIRD_WHATSAPP_TEMPLATE_DEMOS_INTRO,
    BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_AGENDA: process.env.BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_AGENDA,
    BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS: process.env.BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS,
    BIRD_WHATSAPP_TEMPLATE_DEMOS_FOLLOWUP: process.env.BIRD_WHATSAPP_TEMPLATE_DEMOS_FOLLOWUP,
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
