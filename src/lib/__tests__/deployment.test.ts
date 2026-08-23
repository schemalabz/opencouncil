/**
 * Tests for the dev-tooling gate (issue #250): dev tooling is allowed in local
 * dev and on previews, never on staging or real production. The gate reads
 * DEPLOYMENT_ENV from process.env directly (see src/lib/deployment.ts), so these
 * cases set the process env rather than mocking env.mjs.
 */

import { devToolsAllowed } from '../deployment';

describe('devToolsAllowed', () => {
    const prev = process.env.DEPLOYMENT_ENV;
    afterEach(() => {
        if (prev === undefined) {
            delete process.env.DEPLOYMENT_ENV;
        } else {
            process.env.DEPLOYMENT_ENV = prev;
        }
    });

    it.each([
        ['development', true],
        ['preview', true],
        ['staging', false],
        ['production', false],
    ])('%s → %s', (deploymentEnv, expected) => {
        process.env.DEPLOYMENT_ENV = deploymentEnv;
        expect(devToolsAllowed()).toBe(expected);
    });

    it('an unrecognized value resolves to the locked (production) side', () => {
        process.env.DEPLOYMENT_ENV = 'something-else';
        expect(devToolsAllowed()).toBe(false);
    });
});
