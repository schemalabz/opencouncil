/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { createAdministrativeBody as createBody, editAdministrativeBody } from '@/lib/db/administrativeBodies'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, signInAsSuperAdmin } from '../helpers/factories'

describe('administrative body place', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: 'testcity' })
    })

    test('editAdministrativeBody stores the place', async () => {
        const body = await createAdministrativeBody('testcity')
        await editAdministrativeBody(body.id, { place: 'Αίθουσα Δημοτικού Συμβουλίου' })
        const stored = await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })
        expect(stored.place).toBe('Αίθουσα Δημοτικού Συμβουλίου')
    })

    test('createAdministrativeBody stores the place', async () => {
        const body = await createBody({
            cityId: 'testcity',
            name: 'Δημοτικό Συμβούλιο',
            name_en: 'Municipal Council',
            type: 'council',
            notificationBehavior: 'NOTIFICATIONS_APPROVAL',
            showUnreviewedTranscript: false,
            youtubeChannelUrl: null,
            contactEmails: [],
            diavgeiaUnitIds: [],
            place: 'Αίθουσα Δημοτικού Συμβουλίου',
        })
        const stored = await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })
        expect(stored.place).toBe('Αίθουσα Δημοτικού Συμβουλίου')
    })
})
