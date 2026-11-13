/** @jest-environment node */
// The script deletes production data. Its guards: --delete needs
// DEPLOYMENT_ENV=production, and --city refuses a value that is not a city id
// (empty, or with a "/"). yargs is ESM-only, so Jest cannot import
// the script; this runs it as `npm run` does, with a database URL that points
// nowhere. Every case here must stop before the first query, so none reaches
// a database even if the guard is gone: it fails on the unreachable URL with
// another message.
// The dry-run guard (no deletion without --delete) needs a database, so it is
// not covered here; exporting main(argv, deps) from the script would allow it.
import { spawnSync } from 'child_process';
import path from 'path';

const root = path.join(__dirname, '..', '..');
function runScript(args: string[], deploymentEnv?: string) {
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test', SKIP_ENV_VALIDATION: '1',
        DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/none',
        DIRECT_URL: 'postgresql://nobody@127.0.0.1:1/none',
        ...(deploymentEnv === undefined ? {} : { DEPLOYMENT_ENV: deploymentEnv }),
    };
    const r = spawnSync(path.join(root, 'node_modules/.bin/tsx'),
        ['--require', './scripts/lib/allow-server-only.cjs', 'scripts/delete-voiceprints-without-consent.ts', ...args],
        { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

jest.setTimeout(120_000);

describe('delete-voiceprints-without-consent', () => {
    it.each([[undefined], ['staging'], ['preview']])('refuses --delete with DEPLOYMENT_ENV=%s, before it reads anything', (deploymentEnv) => {
        const { status, out } = runScript(['--delete'], deploymentEnv);
        expect(status).toBe(1);
        expect(out).toContain('--delete runs only with DEPLOYMENT_ENV=production set explicitly');
        expect(out).not.toMatch(/Can't reach database|P1001/);
    });

    it.each([[''], ['a/b'], ['..']])('refuses --city %j, which is not a city id, before it reads anything', (city) => {
        const { status, out } = runScript(['--city', city, '--delete'], 'production');
        expect(status).toBe(1);
        expect(out).toContain('Not a city id');
        expect(out).not.toMatch(/Can't reach database|P1001/);
    });
});
