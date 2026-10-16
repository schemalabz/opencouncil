/**
 * The NEXT_PUBLIC_ variables that client code reads. The build inlines each
 * `process.env.NEXT_PUBLIC_*` access, and src/env.mjs validates the same
 * variables on the server. Client code must not import env.mjs: it would add
 * t3-env and zod to the bundle of every page that renders the component.
 */
export const publicEnv = {
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
};
