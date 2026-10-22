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
import { sendInviteEmail } from '@/lib/auth/invite'
import { mintMachineToken } from '@/lib/actions/machineAccounts'
import { NotFoundError } from '@/lib/api/errors'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createUser, signInAsSuperAdmin } from '../helpers/factories'
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
        expect(res.status).toBe(409)
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
    test("the machine-token actions never mint a token for a person's account", async () => {   // T8
        const person = await createUser('anna@example.com')
        await expect(mintMachineToken(person.id)).rejects.toThrow(NotFoundError)
        expect(await prisma.userMcpToken.count()).toBe(0)
        await expect(mintMachineToken(machineId)).resolves.toMatchObject({ rawToken: expect.stringMatching(/^mcp_/) })
    })
})
