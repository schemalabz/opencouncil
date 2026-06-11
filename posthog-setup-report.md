<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into OpenCouncil — a Greek municipal council transparency platform. PostHog is initialized client-side via `instrumentation-client.ts` (Next.js 15.3+ pattern) and server-side via `src/lib/posthog-server.ts`. A reverse proxy is configured in `next.config.mjs` to route PostHog traffic through the app (`/ingest/*` → EU PostHog endpoints), avoiding ad-blocker interference. User identification is wired up at sign-in time using the submitted email as the PostHog distinct ID, enabling cross-session correlation.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `sign_in_requested` | User submits the email sign-in form (magic link request). Also calls `posthog.identify()` with the email. | `src/components/user/sign-in.tsx` |
| `search_performed` | User executes a search query. Properties: `query_length`, `has_city_filter`, `has_person_filter`, `has_party_filter`, `results_count`. | `src/components/search/SearchPage.tsx` |
| `chat_message_sent` | User sends a message to the AI assistant. Properties: `has_city_filter`, `message_length`, `message_count`. | `src/hooks/useChat.ts` |
| `notification_signup_completed` | User successfully subscribes to city council notifications. Properties: `city_id`, `location_count`, `topic_count`, `has_phone`. | `src/contexts/OnboardingContext.tsx` |
| `petition_submitted` | User submits a petition to add their city to OpenCouncil. Properties: `city_id`, `is_resident`, `is_citizen`, `has_phone`. | `src/contexts/OnboardingContext.tsx` |
| `consultation_comment_submitted` | **Server-side.** User posts a comment on a public consultation. Properties: `consultation_id`, `city_id`, `entity_type`. Distinct ID from session email. | `src/app/api/consultations/[id]/comments/route.ts` |
| `offer_letter_viewed` | **Server-side.** A pricing offer letter is opened — top of the city sales funnel. Properties: `offer_id`. | `src/app/[locale]/(other)/offer-letter/[offerId]/page.tsx` |
| `highlight_viewed` | **Server-side.** A meeting highlight page is loaded — top of the content consumption funnel. Properties: `highlight_id`, `city_id`, `meeting_id`. | `src/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/highlights/[highlightId]/page.tsx` |

## New files

| File | Purpose |
|---|---|
| `instrumentation-client.ts` | Client-side PostHog initialization (Next.js 15.3+ pattern) |
| `src/lib/posthog-server.ts` | Server-side PostHog singleton (`posthog-node`) |

## Config changes

| File | Change |
|---|---|
| `next.config.mjs` | Added EU reverse proxy rewrites (`/ingest/*`) and `skipTrailingSlashRedirect: true` |
| `.env` | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |

## LLM analytics (AI Observability)

All Anthropic SDK calls in the app are automatically instrumented via OpenTelemetry. Every call to `aiChat` (used for background summarisation tasks) and `aiChatStream` (used by the chat API) emits a `$ai_generation` event to PostHog with model name, token counts (input/output), latency, and calculated cost in USD.

**How it works:** `AnthropicInstrumentation` from `@traceloop/instrumentation-anthropic` patches the Anthropic SDK at the module level and emits `gen_ai.*` OpenTelemetry spans. `PostHogSpanProcessor` from `@posthog/ai` exports those spans to PostHog's OTLP ingestion endpoint, where they are converted to `$ai_generation` events server-side.

**Packages added:** `@posthog/ai`, `@opentelemetry/sdk-node`, `@opentelemetry/resources`, `@traceloop/instrumentation-anthropic`

**File modified:** `src/instrumentation-node.ts` — `NodeSDK` with `PostHogSpanProcessor` and `AnthropicInstrumentation` started at server boot, before any Anthropic calls are made.

View AI generations and traces under [AI Observability](https://eu.posthog.com/project/199736/ai-observability) in PostHog.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://eu.posthog.com/project/199736/dashboard/742051)
- [Notification signup funnel](https://eu.posthog.com/project/199736/insights/XQvE7QzZ) — conversion from sign-in request → completed notification subscription
- [Search & chat engagement trend](https://eu.posthog.com/project/199736/insights/GLq9ZIVJ) — daily search queries and AI chat messages
- [Petition submissions trend](https://eu.posthog.com/project/199736/insights/L6YyCyBg) — weekly petitions to add cities
- [Consultation comment submissions trend](https://eu.posthog.com/project/199736/insights/FIPqf8Oo) — daily consultation comments
- [Highlight views trend](https://eu.posthog.com/project/199736/insights/eoYCcm8a) — daily highlight page loads

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
