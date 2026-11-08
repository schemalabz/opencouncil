/**
 * The cross-variable rule in src/env.mjs, loaded as the app loads it. Jest
 * cannot load the ESM-only @t3-oss/env-nextjs, and every other test mocks
 * env.mjs, so this imports it in a child Node process, as next.config.mjs does.
 */
import { spawnSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '../..');

// Every required variable. Fake values only.
const required: Record<string, string> = {
    DATABASE_URL: 'postgres://x@localhost/db',
    DIRECT_URL: 'postgres://x@localhost/db',
    RESEND_API_KEY: 'r',
    NEXTAUTH_SECRET: 's',
    NEXTAUTH_URL: 'http://localhost:3000',
    ANTHROPIC_API_KEY: 'a',
    GOOGLE_API_KEY: 'g',
    DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
    DO_SPACES_KEY: 'k',
    DO_SPACES_SECRET: 's',
    DO_SPACES_BUCKET: 'bucket',
    CDN_URL: 'https://cdn.example',
    TASK_API_URL: 'https://tasks.example',
    TASK_API_KEY: 't',
    ELASTICSEARCH_URL: 'https://es.example',
    ELASTICSEARCH_API_KEY: 'e',
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'm',
};

/** Loads src/env.mjs with exactly these variables and prints its fallback; `client` loads it as the browser bundle would. */
function loadEnv(extra: Record<string, string>, { client = false } = {}) {
    const script = `${client ? 'globalThis.window = {};' : ''} const { env } = await import('./src/env.mjs');`
        + ` ${client ? '' : 'console.log(JSON.stringify({ fallback: env.SUBJECT_IMAGES_FALLBACK_PREFIX ?? null }));'}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        // NODE_ENV as `next start` sets it; each case names its DEPLOYMENT_ENV.
        env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...required, ...extra },
        encoding: 'utf8',
    });
    const fallback = result.status === 0 && !client ? JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}').fallback : undefined;
    return { ok: result.status === 0, stderr: result.stderr, fallback };
}

describe('src/env.mjs: the subject image fallback', () => {
    it('starts production with no fallback', () => {
        expect(loadEnv({ DEPLOYMENT_ENV: 'production' })).toMatchObject({ ok: true, fallback: null });
    });

    it("gives every other deployment production's folder, an empty value counting as unset", () => {
        expect(loadEnv({ DEPLOYMENT_ENV: 'staging' })).toMatchObject({ ok: true, fallback: 'subject-images/prod/8bit' });
        expect(loadEnv({ DEPLOYMENT_ENV: 'development', SUBJECT_IMAGES_FALLBACK_PREFIX: '' })).toMatchObject({ ok: true, fallback: 'subject-images/prod/8bit' });
    });

    it('refuses a fallback in production', () => {
        const { ok, stderr } = loadEnv({ DEPLOYMENT_ENV: 'production', SUBJECT_IMAGES_FALLBACK_PREFIX: 'subject-images/prod/8bit' });
        expect(ok).toBe(false);
        expect(stderr).toContain('SUBJECT_IMAGES_FALLBACK_PREFIX: Must be unset in production');
    });

    // The browser bundle sees no server variables: the rule must not run there.
    it('does not apply the rule in the browser bundle', () => {
        expect(loadEnv({ DEPLOYMENT_ENV: 'production', SUBJECT_IMAGES_FALLBACK_PREFIX: 'subject-images/prod/8bit' }, { client: true }).ok).toBe(true);
    });
});
