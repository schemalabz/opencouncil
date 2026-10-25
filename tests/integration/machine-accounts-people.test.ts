/** @jest-environment node */
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn() }))
jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn(async () => true) }))
jest.mock('@/lib/deployment', () => ({ ...jest.requireActual('@/lib/deployment'), DEV_TOOLS_ALLOWED: true }))
import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { PUT as putOperator } from '@/app/api/cities/[cityId]/meetings/[meetingId]/operator/route'
import { POST as resendInvite } from '@/app/api/admin/users/[userId]/resend-invite/route'
import { POST as quickLogin } from '@/app/api/dev/quick-login/route'
import { getProductUpdateRecipientCount, getProductUpdateRecipients } from '@/lib/db/productUpdates'
import { getAdminDashboardStats } from '@/lib/db/adminStats'
import { getUsers } from '@/lib/db/users'
import { addBodyAdmin, listBodyAdmins } from '@/lib/db/bodyAdmins'
import { countEmailRecipientsForMeeting, getNotificationImpactPreviewData } from '@/lib/db/notifications'
import { getPeopleWithVoicePrintsForCity } from '@/lib/db/people'
import { listMachineAccounts } from '@/lib/db/machineAccounts'
import { sendInviteEmail } from '@/lib/auth/invite'
import { mintMachineToken } from '@/lib/actions/machineAccounts'
import { NotFoundError } from '@/lib/api/errors'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createNotificationPreference, createPerson, createSubject, createTopic, createUser, signInAsSuperAdmin } from '../helpers/factories'
const json = (url: string, body: unknown, method = 'POST') => new NextRequest(new URL(url, 'http://localhost'),
    { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
describe('a machine account is not a person', () => {
    let machineId: string
    beforeAll(async () => { await ensureTestDb() })
    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        machineId = (await createUser('paola@machines.opencouncil.invalid', { isMachine: true, isSuperAdmin: true, allowProductUpdates: true })).id
    })
    test('the operator PUT refuses a machine account, though it is a superadmin', async () => {
        await createCity({ id: 'athens' }); await createMeeting('athens', { id: 'm1' })
        const res = await putOperator(json('/api/cities/athens/meetings/m1/operator', { userId: machineId }, 'PUT'),
            { params: Promise.resolve({ cityId: 'athens', meetingId: 'm1' }) })
        expect(res.status).toBe(400)
        expect(await prisma.meetingOperator.count()).toBe(0)
    })
    test('resend-invite sends no invite to a machine account', async () => {
        const res = await resendInvite(json(`/api/admin/users/${machineId}/resend-invite`, {}), { params: Promise.resolve({ userId: machineId }) })
        expect(res.status).toBe(404)
        expect(sendInviteEmail).not.toHaveBeenCalled()
    })
    test('quick-login opens no session for a machine account', async () => {
        const res = await quickLogin(json('/api/dev/quick-login', { email: 'paola@machines.opencouncil.invalid' }))
        expect(res.status).toBe(404)
        expect(await prisma.session.count({ where: { userId: machineId } })).toBe(0)
    })
    test('product updates and the admin dashboard count people only', async () => {
        expect((await getProductUpdateRecipients()).map(r => r.email)).toEqual(['superadmin@integration.test'])
        expect(await getProductUpdateRecipientCount()).toEqual({ optedIn: 1, total: 1 })
        expect((await getAdminDashboardStats()).users).toMatchObject({ total: 1, newLast7Days: 1 })
    })
    test('the users list and a body admin list hold people only', async () => {
        await createCity({ id: 'athens' })
        const body = await createAdministrativeBody('athens')
        const person = await createUser('anna@example.com')
        await prisma.administers.createMany({ data: [
            { userId: person.id, administrativeBodyId: body.id },
            { userId: machineId, administrativeBodyId: body.id },
        ] })
        expect((await getUsers()).map(u => u.id)).not.toContain(machineId)
        expect((await listBodyAdmins('athens', body.id)).map(a => a.userId)).toEqual([person.id])
    })
    test('the recipients of a meeting and the impact preview hold people only', async () => {
        // A machine account never gets a preference through the app; one
        // written straight to the database must still never reach a send.
        await createCity({ id: 'athens' }); await createMeeting('athens', { id: 'm1' })
        await createTopic('roads')
        await createSubject('m1', 'athens', { id: 's1', topicId: 'roads' })
        const person = await createUser('anna@example.com')
        for (const userId of [person.id, machineId]) {
            await createNotificationPreference({ userId, cityId: 'athens', topicIds: ['roads'] })
        }
        expect(await countEmailRecipientsForMeeting('athens', 'm1', 'afterMeeting')).toBe(1)
        expect((await getNotificationImpactPreviewData('m1', 'athens')).usersWithPreferences.map(u => u.userId)).toEqual([person.id])
    })
    test('the admin people page counts the people who administer a person', async () => {
        await createCity({ id: 'athens' })
        const councillor = await createPerson('athens')
        const person = await createUser('anna@example.com')
        await prisma.administers.createMany({ data: [
            { userId: person.id, personId: councillor.id },
            { userId: machineId, personId: councillor.id },
        ] })
        const [row] = await getPeopleWithVoicePrintsForCity('athens')
        expect(row._count.administrators).toBe(1)
    })
    test('the seat cap of a body counts people only', async () => {
        // A body is full at 20 admins; machine grants are not seats.
        await createCity({ id: 'athens' })
        const body = await createAdministrativeBody('athens')
        const people = await Promise.all(Array.from({ length: 19 }, (_, i) => createUser(`p${i}@example.com`)))
        const bots = await Promise.all(Array.from({ length: 3 }, (_, i) => createUser(`bot${i}@machines.opencouncil.invalid`, { isMachine: true })))
        await prisma.administers.createMany({ data: [...people, ...bots].map(u => ({ userId: u.id, administrativeBodyId: body.id })) })
        await expect(addBodyAdmin('athens', body.id, { email: 'twentieth@example.com' })).resolves.toMatchObject({ created: true })
    })
    test("the machines page lists machine accounts only, so it never shows a person's tokens", async () => {
        const person = await createUser('anna@example.com')
        await prisma.userMcpToken.create({ data: { userId: person.id, name: 'Claude', keyPrefix: 'mcp_anna', hashedKey: 'anna-hash' } })
        await mintMachineToken(machineId)
        const accounts = await listMachineAccounts()
        expect(accounts.map(a => a.id)).toEqual([machineId])
        expect(accounts[0].mcpTokens).toHaveLength(1)
        expect(accounts[0].mcpTokens[0]).not.toHaveProperty('hashedKey')
    })
    test("the machine-token actions never mint a token for a person's account", async () => {   // T8
        const person = await createUser('anna@example.com')
        await expect(mintMachineToken(person.id)).rejects.toThrow(NotFoundError)
        expect(await prisma.userMcpToken.count()).toBe(0)
        await expect(mintMachineToken(machineId)).resolves.toMatchObject({ rawToken: expect.stringMatching(/^mcp_/) })
    })
})
