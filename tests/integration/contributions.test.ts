/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { getLatestContributionsForParty, getLatestContributionsForSpeaker } from '@/lib/db/contributions'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createPerson, createSubject } from '../helpers/factories'

describe('contribution lists - integration', () => {
    let personId: string
    let partyId: string

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        __setSessionEmail(null)

        await createCity({ id: 'athens' })
        const party = await prisma.party.create({
            data: { cityId: 'athens', name: 'Παράταξη', name_en: 'Party', name_short: 'ΠΑ', name_short_en: 'PA', colorHex: '#123456' },
        })
        partyId = party.id
        const person = await createPerson('athens', { name: 'Μαρία Παππά' })
        personId = person.id
        await prisma.role.create({ data: { personId, partyId } })

        await createMeeting('athens', { id: 'm1', dateTime: new Date('2026-05-05T15:00:00Z'), released: true })
        for (let i = 0; i < 7; i++) {
            const subject = await createSubject('m1', 'athens', { id: `s${i}`, name: `Θέμα ${i}` })
            await prisma.speakerContribution.create({ data: { subjectId: subject.id, speakerId: personId, text: `Τοποθέτηση ${i}` } })
        }
    })

    test('a person\'s list reports the total over every page', async () => {
        const { results, total } = await getLatestContributionsForSpeaker(personId, 2, 5)
        expect(results).toHaveLength(2)
        expect(total).toBe(7)
    })

    test('a party\'s list reports the total over every page', async () => {
        const { results, total } = await getLatestContributionsForParty(partyId, 1, 5)
        expect(results).toHaveLength(5)
        expect(total).toBe(7)
    })
})
