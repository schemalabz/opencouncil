/** @jest-environment node */
import { cacheGetJSON, cacheSetJSON, cacheHas } from '@/lib/cache/valkey'

/**
 * The cache is optional: dev and previews run without CACHE_URL, and the layer
 * must degrade to no-ops rather than throw.
 *
 * This lives in its own file because the client is a module-level singleton —
 * once connected it is returned regardless of a later CACHE_URL change, so the
 * unset path cannot be exercised in a file that has already connected.
 */
describe('valkey cache layer without CACHE_URL', () => {
    beforeAll(() => {
        delete process.env.CACHE_URL
    })

    it('no-ops instead of throwing', async () => {
        expect(await cacheSetJSON('k', { a: 1 }, 60)).toBe(false)
        expect(await cacheGetJSON('k')).toBeNull()
        expect(await cacheHas('k')).toBe(false)
    })
})
