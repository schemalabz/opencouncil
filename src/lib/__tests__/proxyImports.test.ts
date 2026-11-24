/** @jest-environment node */
// The proxy runs for every page request. The modules of its path checks must
// not load the UI and data-layer code behind these imports.
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
for (const heavy of ['@/lib/utils', '@/lib/auth', '@/lib/db/cities', '@/lib/cache/queries', '@/lib/cache']) {
    jest.doMock(heavy, () => {
        throw new Error(`the proxy loaded ${heavy}`);
    });
}

it.each(['@/lib/db/cityRealm', '@/lib/pageSegments', '@/lib/dottedPaths'])('loads %s without the heavy modules', (module) => {
    expect(() => require(module)).not.toThrow();
});
