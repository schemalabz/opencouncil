/** @jest-environment node */
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import { cacheGetJSON, cacheSetJSON, cacheHas, cacheIncrWindow, disconnectCache } from '@/lib/cache/valkey'

/**
 * Integration coverage for the Valkey cache layer.
 *
 * The layer is a thin wrapper over the `redis` client, and nothing exercised it
 * before: every existing test mocks '@/lib/cache/valkey'. A redis major bump
 * therefore passed CI while proving nothing about runtime behaviour.
 *
 * These tests run the real client against a real Valkey, over the surface the
 * application actually uses — JSON round-tripping, TTL, and the no-op path when
 * CACHE_URL is unset.
 */

let container: StartedTestContainer | undefined

// The env mock proxies process.env at access time, so CACHE_URL can be set
// after the module is imported.
const setCacheUrl = (url: string | undefined) => {
    if (url) process.env.CACHE_URL = url
    else delete process.env.CACHE_URL
}

beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start()
    setCacheUrl(`redis://${container.getHost()}:${container.getMappedPort(6379)}`)
}, 120_000)

afterAll(async () => {
    // Release the socket before stopping the container, or the client retries
    // against a dead endpoint and the open handle keeps jest alive.
    await disconnectCache()
    setCacheUrl(undefined)
    await container?.stop()
})

describe('valkey cache layer', () => {
    it('round-trips a JSON value', async () => {
        expect(await cacheSetJSON('rt', { a: 1, nested: { b: [2, 3] } }, 60)).toBe(true)
        expect(await cacheGetJSON<{ a: number; nested: { b: number[] } }>('rt')).toEqual({
            a: 1,
            nested: { b: [2, 3] },
        })
    })

    it('reports presence only for keys that were written', async () => {
        await cacheSetJSON('present', { x: true }, 60)
        expect(await cacheHas('present')).toBe(true)
        expect(await cacheHas('never-written')).toBe(false)
    })

    it('returns null for a missing key rather than throwing', async () => {
        expect(await cacheGetJSON('absent')).toBeNull()
    })

    it('honours the TTL, so entries expire', async () => {
        await cacheSetJSON('ttl', { v: 1 }, 1)
        expect(await cacheHas('ttl')).toBe(true)
        await new Promise((r) => setTimeout(r, 1500))
        expect(await cacheHas('ttl')).toBe(false)
    })

    it('preserves falsy values, distinguishing them from a miss', async () => {
        await cacheSetJSON('falsy', 0, 60)
        expect(await cacheGetJSON('falsy')).toBe(0)
        await cacheSetJSON('empty', '', 60)
        expect(await cacheGetJSON('empty')).toBe('')
    })

    it('counts hits in one fixed window and starts over when it ends', async () => {
        const first = await cacheIncrWindow('window', 1000)
        expect(first).toEqual({ count: 1, resetInMs: 1000 })
        const second = await cacheIncrWindow('window', 1000)
        expect(second).not.toBe('unavailable')
        if (second === 'unavailable') return
        expect(second.count).toBe(2)
        expect(second.resetInMs).toBeLessThanOrEqual(1000)
        expect(second.resetInMs).toBeGreaterThan(0)
        await new Promise((r) => setTimeout(r, 1100))
        expect(await cacheIncrWindow('window', 1000)).toEqual({ count: 1, resetInMs: 1000 })
    })

    it('counts concurrent hits without losing one', async () => {
        const replies = await Promise.all(Array.from({ length: 20 }, () => cacheIncrWindow('burst', 60_000)))
        const counts = replies.map((r) => (r === 'unavailable' ? -1 : r.count)).sort((a, b) => a - b)
        expect(counts).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    })
})
