/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { countActiveTopicsByRealm, createRealmTopicsDirect } from '@/lib/db/topicsAdmin'
import { createTopicsToolInput } from '@/lib/mcp/adminToolSchemas'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'

const topic = (name: string, name_en = name) => ({ name, name_en, colorHex: '#123456', icon: 'leaf', description: `${name} items.` })
const parse = (topics: ReturnType<typeof topic>[]) => createTopicsToolInput.parse({ realm: 'south_africa', topics }).topics

describe('createRealmTopicsDirect', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    it('adds the topics to the realm and skips a label that the realm already has, as name or English name', async () => {
        const water = await prisma.topic.create({ data: { ...topic('Water'), realm: 'south_africa', deprecated: true } })
        const roads = await prisma.topic.create({ data: { ...topic('Paaie', 'Roads'), realm: 'south_africa' } })
        await prisma.topic.create({ data: { ...topic('Housing'), realm: 'greece' } })

        const { created, skipped } = await createRealmTopicsDirect('south_africa',
            parse([topic('water '), topic('Housing'), topic('Transport'), topic('Strate', 'roads')]))

        expect(created.map((t) => t.name).sort()).toEqual(['Housing', 'Transport'])
        expect(skipped).toEqual([
            { name: 'water', existing: { id: water.id, name: 'Water', name_en: 'Water', deprecated: true } },
            { name: 'Strate', existing: { id: roads.id, name: 'Paaie', name_en: 'Roads', deprecated: false } },
        ])
        expect(await prisma.topic.count({ where: { realm: 'south_africa' } })).toBe(4)
        // A second call adds nothing.
        const again = await createRealmTopicsDirect('south_africa', parse([topic('Housing'), topic('Transport')]))
        expect(again.created).toEqual([])
        expect(await prisma.topic.count({ where: { realm: 'south_africa' } })).toBe(4)
    })

    it('counts the active topics of each realm', async () => {
        await createRealmTopicsDirect('south_africa', parse([topic('Water'), topic('Housing')]))
        await prisma.topic.create({ data: { ...topic('Old'), realm: 'south_africa', deprecated: true } })

        expect(await countActiveTopicsByRealm()).toEqual([{ realm: 'south_africa', _count: { _all: 2 } }])
    })
})
