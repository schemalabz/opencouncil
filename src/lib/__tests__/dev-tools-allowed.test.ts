/**
 * Tests for the dev-tooling gate (issue #250).
 *
 * IS_DEV / IS_PREVIEW / DEV_TOOLS_ALLOWED are evaluated at module load time from
 * process.env, so each case sets env vars and re-imports the module in isolation.
 */

describe('DEV_TOOLS_ALLOWED gate', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalIsPreview = process.env.IS_PREVIEW;

    afterEach(() => {
        // Restore original env
        (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
        process.env.IS_PREVIEW = originalIsPreview;
        jest.resetModules();
    });

    const loadFlags = () => {
        let flags!: typeof import('../utils');
        jest.isolateModules(() => {
            flags = require('../utils');
        });
        return flags;
    };

    it('is false on real production (no flags set)', () => {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        delete process.env.IS_PREVIEW;
        const { IS_DEV, IS_PREVIEW, DEV_TOOLS_ALLOWED } = loadFlags();
        expect(IS_DEV).toBe(false);
        expect(IS_PREVIEW).toBe(false);
        expect(DEV_TOOLS_ALLOWED).toBe(false);
    });

    it('is true on preview deployments (production + IS_PREVIEW=true)', () => {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.IS_PREVIEW = 'true';
        const { IS_DEV, IS_PREVIEW, DEV_TOOLS_ALLOWED } = loadFlags();
        expect(IS_DEV).toBe(false);
        expect(IS_PREVIEW).toBe(true);
        expect(DEV_TOOLS_ALLOWED).toBe(true);
    });

    it('is true in local development', () => {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
        delete process.env.IS_PREVIEW;
        const { IS_DEV, DEV_TOOLS_ALLOWED } = loadFlags();
        expect(IS_DEV).toBe(true);
        expect(DEV_TOOLS_ALLOWED).toBe(true);
    });

    it('treats any non-"true" IS_PREVIEW value as disabled', () => {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.IS_PREVIEW = '1';
        const { IS_PREVIEW, DEV_TOOLS_ALLOWED } = loadFlags();
        expect(IS_PREVIEW).toBe(false);
        expect(DEV_TOOLS_ALLOWED).toBe(false);
    });
});
