/** @jest-environment node */

import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { getTasksForMeeting, getVoiceprintTasksForPerson } from '@/lib/db/tasks'
import { mcpGetMeeting } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { __setSessionEmail } from '../mocks/auth'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createPerson, createTaskStatus, createUser, signInAsSuperAdmin } from '../helpers/factories'

/**
 * A voiceprint task holds a person's voice in its bodies, and its existence
 * tells that the person consented. Every list of tasks shows it to a
 * superadmin only: the meeting's task list on the site, the person's
 * voiceprint tasks, and get_meeting on the MCP server. The real guard chain
 * decides, from the seeded accounts.
 */
describe('who sees a voiceprint task', () => {
    let personId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        __setSessionEmail(null)
        await createCity({ id: 'c1' })
        await createMeeting('c1', { id: 'm1' })
        personId = (await createPerson('c1')).id
        await createTaskStatus('m1', 'c1', { type: 'transcribe' })
        await createTaskStatus('m1', 'c1', { type: 'generateVoiceprint', requestBody: JSON.stringify({ personId }), responseBody: '{"voiceprint":"[0.1]"}' })
    })

    const siteTypes = async () => (await getTasksForMeeting('c1', 'm1')).map((task) => task.type).sort()
    const mcpTypes = async (userId: string) => {
        const meeting = await mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', { userId }), () => mcpGetMeeting('c1', 'm1', { userId }))
        return (meeting.tasks ?? []).map((task) => task.type).sort()
    }

    test('a city admin sees no voiceprint task, on the site or on the MCP server', async () => {
        const admin = await createUser('city-admin@integration.test')
        await prisma.administers.create({ data: { userId: admin.id, cityId: 'c1' } })
        __setSessionEmail(admin.email)

        expect(await siteTypes()).toEqual(['transcribe'])
        await expect(getVoiceprintTasksForPerson(personId)).rejects.toThrow()
        expect(await mcpTypes(admin.id)).toEqual(['transcribe'])
    })

    test('a superadmin sees it everywhere', async () => {
        const admin = await signInAsSuperAdmin()

        expect(await siteTypes()).toEqual(['generateVoiceprint', 'transcribe'])
        expect((await getVoiceprintTasksForPerson(personId)).map((task) => task.type)).toEqual(['generateVoiceprint'])
        expect(await mcpTypes(admin.id)).toEqual(['generateVoiceprint', 'transcribe'])
    })
})
