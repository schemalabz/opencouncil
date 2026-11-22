// Plain CommonJS: telemetry.cjs requires it before Next starts; the app and
// next.config.mjs import it. The hosts of PostHog's EU cloud, which the privacy
// policy names as the place where PostHog keeps our data.

/** Events, logs and the browser's proxied requests. */
const POSTHOG_EU_INGEST = 'https://eu.i.posthog.com';
/** The browser SDK's static files and config. */
const POSTHOG_EU_ASSETS = 'https://eu-assets.i.posthog.com';

module.exports = { POSTHOG_EU_INGEST, POSTHOG_EU_ASSETS };
