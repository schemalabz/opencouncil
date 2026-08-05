/**
 * Tests for the dev-tooling gate (issue #250): dev tooling is allowed in local
 * dev and on previews, never on staging or real production. DEPLOYMENT_ENV
 * itself is resolved and validated in src/env.mjs (zod enum + default), so the
 * cases here mock the resolved value.
 */

describe('DEV_TOOLS_ALLOWED', () => {
    afterEach(() => {
        jest.resetModules();
    });

    const load = (deploymentEnv: string) => {
        let mod!: typeof import('../deployment');
        jest.isolateModules(() => {
            jest.doMock('@/env.mjs', () => ({ env: { DEPLOYMENT_ENV: deploymentEnv } }));
            mod = require('../deployment');
        });
        return mod;
    };

    it.each([
        ['development', true],
        ['preview', true],
        ['staging', false],
        ['production', false],
    ])('%s → %s', (deploymentEnv, expected) => {
        expect(load(deploymentEnv).DEV_TOOLS_ALLOWED).toBe(expected);
    });
});
