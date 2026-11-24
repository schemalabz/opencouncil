import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The Valkey namespace of the shared cache: `<environment>:<build>`.
 *
 * Production and staging can use the same Valkey database, so the environment
 * key keeps their entries apart. The build key keeps the entries of each
 * deploy apart: a cached RSC payload from another build names server actions
 * that this build does not have ("Failed to find Server Action").
 *
 * Plain `.mjs` with no dependencies, because `cache-handler.mjs` imports it
 * and Node loads that file without a bundler.
 *
 * @param {{ env?: Record<string, string | undefined>, buildId?: string, cwd?: string }} [options]
 * @returns {Promise<string>}
 */
export async function cacheNamespace({ env = process.env, buildId, cwd = process.cwd() } = {}) {
    return `${environmentKey(env)}:${await buildKey(env, buildId, cwd)}`;
}

function environmentKey(env) {
    if (env.APP_ENV) return env.APP_ENV;
    try {
        return new URL(env.NEXTAUTH_URL).host;
    } catch {
        return env.NODE_ENV || 'unknown';
    }
}

/**
 * `buildId` is what Next gives the cache handler, and Next gives it only to
 * the app's server. The proxy's copy of the handler gets no build directory,
 * so it reads `.next/BUILD_ID` itself. Both `next start` and the standalone
 * server run from the directory that holds `.next`. Without this read, the
 * proxy used another namespace, and the app's tag clears did not reach it.
 */
async function buildKey(env, buildId, cwd) {
    const key = env.SOURCE_COMMIT || env.BUILD_ID || buildId?.trim() || (await readBuildId(cwd));
    if (key) return key;
    console.warn('[cache-handler] No build id: every build that has none shares the `nobuild` namespace');
    return 'nobuild';
}

async function readBuildId(cwd) {
    try {
        return (await readFile(path.join(cwd, '.next', 'BUILD_ID'), 'utf8')).trim() || undefined;
    } catch {
        return undefined;
    }
}
