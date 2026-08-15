// Intentionally empty. Without this file, Next's instrumentation discovery
// (which searches the Turbopack workspace root's src/ as well) picks up the
// MAIN app's src/instrumentation.ts and tries to bundle its Prisma/cache
// imports into Notis. An app-local no-op wins the lookup.
export async function register() {}
