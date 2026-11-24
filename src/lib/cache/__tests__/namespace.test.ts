/** @jest-environment node */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { cacheNamespace } from '../namespace.mjs';

// As production sets it: no SOURCE_COMMIT, no BUILD_ID.
const env = { NEXTAUTH_URL: 'https://opencouncil.gr' };

/** A directory that holds `.next/BUILD_ID`, as the app root does after a build. */
function appRoot(buildId: string): string {
    const root = mkdtempSync(path.join(tmpdir(), 'cache-namespace-'));
    mkdirSync(path.join(root, '.next'));
    writeFileSync(path.join(root, '.next', 'BUILD_ID'), buildId);
    return root;
}

describe('cacheNamespace', () => {
    it('gives the proxy, which gets no build id from Next, the namespace of the app', async () => {
        const cwd = appRoot('LHu8znd6p4D5CBsxiQfwn');

        const app = await cacheNamespace({ env, buildId: 'LHu8znd6p4D5CBsxiQfwn', cwd });
        const proxy = await cacheNamespace({ env, buildId: undefined, cwd });

        expect(proxy).toBe('opencouncil.gr:LHu8znd6p4D5CBsxiQfwn');
        expect(proxy).toBe(app);
    });

    it('reads the build id without the line end', async () => {
        expect(await cacheNamespace({ env, cwd: appRoot('abc\n') })).toBe('opencouncil.gr:abc');
        expect(await cacheNamespace({ env, buildId: 'abc\n', cwd: appRoot('abc\n') })).toBe('opencouncil.gr:abc');
    });

    it('prefers the commit and the environment that the deployment sets', async () => {
        const cwd = appRoot('random');

        expect(await cacheNamespace({ env: { ...env, SOURCE_COMMIT: 'c0ffee', APP_ENV: 'staging' }, cwd })).toBe('staging:c0ffee');
    });

    it('falls back to `nobuild` only when no build id exists', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        expect(await cacheNamespace({ env, cwd: mkdtempSync(path.join(tmpdir(), 'no-build-')) })).toBe('opencouncil.gr:nobuild');
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
