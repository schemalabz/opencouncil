/** @jest-environment node */

import http from 'http'
import https from 'https'
import net from 'net'
import type { AddressInfo } from 'net'
import prisma from '@/lib/db/prisma'
import { syncMeetingToCalendar } from '@/lib/google-calendar'
import { sendTaskAdminAlert } from '@/lib/discord'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createUser } from '../helpers/factories'

/**
 * Integration coverage for syncMeetingToCalendar over the real Google API client
 * stack (@googleapis/calendar): the OAuth2 refresh-token exchange, the Calendar v3 events calls,
 * the response parsing, the error shape and the per-request timeout.
 *
 * Nothing in the client is mocked. The test intercepts the transport: every
 * HTTPS connection that the process opens goes to a local plain-HTTP server,
 * which plays both oauth2.googleapis.com and www.googleapis.com. This
 * replaces https.globalAgent, which gaxios (through node-fetch) uses when no
 * proxy is configured.
 */

const CALENDAR_ID = 'opencouncil-test@group.calendar.google.com'

type RecordedRequest = { method: string; host: string; path: string; query: URLSearchParams; headers: http.IncomingHttpHeaders; body: string }
type Reply = { status: number; body?: unknown } | 'hang'
type Route = (req: RecordedRequest) => Reply | undefined | Promise<Reply | undefined>

const recorded: RecordedRequest[] = []
let routes: Route[] = []
let server: http.Server
let originalAgent: https.Agent
// gaxios reads these on each request and then uses a proxy agent instead of
// https.globalAgent, which would send the requests to Google.
const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const
const savedProxyEnv: Partial<Record<(typeof PROXY_VARS)[number], string>> = {}
const openSockets = new Set<net.Socket>()

function calendarRequests() {
    return recorded.filter((r) => r.host === 'www.googleapis.com')
}

function tokenRoute(): Route {
    return (req) => req.host === 'oauth2.googleapis.com' && req.method === 'POST' && req.path === '/token'
        ? { status: 200, body: { access_token: 'access-token-1', expires_in: 3600, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/calendar' } }
        : undefined
}

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
            const url = new URL(req.url ?? '/', 'http://placeholder')
            const entry: RecordedRequest = {
                method: req.method ?? '',
                host: (req.headers.host ?? '').replace(/:\d+$/, ''),
                path: url.pathname,
                query: url.searchParams,
                headers: req.headers,
                body,
            }
            recorded.push(entry)
            let reply: Reply | undefined
            for (const route of routes) {
                reply = await route(entry)
                if (reply !== undefined) break
            }
            if (reply === 'hang') return
            if (!reply) {
                res.writeHead(599, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ error: { code: 599, message: `unrouted ${entry.method} ${entry.host}${entry.path}` } }))
                return
            }
            res.writeHead(reply.status, { 'content-type': 'application/json' })
            res.end(reply.body === undefined ? '' : JSON.stringify(reply.body))
        })
    })
    server.on('connection', (socket) => {
        openSockets.add(socket)
        socket.on('close', () => openSockets.delete(socket))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    class LocalAgent extends https.Agent {
        createConnection(): net.Socket {
            return net.connect(port, '127.0.0.1')
        }
    }
    for (const name of PROXY_VARS) {
        savedProxyEnv[name] = process.env[name]
        delete process.env[name]
    }
    originalAgent = https.globalAgent
    https.globalAgent = new LocalAgent({ keepAlive: false })
})

afterAll(async () => {
    https.globalAgent = originalAgent
    for (const name of PROXY_VARS) {
        if (savedProxyEnv[name] !== undefined) process.env[name] = savedProxyEnv[name]
    }
    for (const socket of openSockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(async () => {
    await resetDatabase(prisma)
    recorded.length = 0
    routes = [tokenRoute()]
    ;(sendTaskAdminAlert as jest.Mock).mockClear()
    process.env.GOOGLE_CALENDAR_ENABLED = 'true'
    process.env.GOOGLE_CALENDAR_ID = CALENDAR_ID
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token'
    process.env.NEXTAUTH_URL = 'https://opencouncil.gr'
    await createCity({ id: 'athens', name: 'Αθήνα' })
})

const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const PAST = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
const eventsPath = `/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`

describe('syncMeetingToCalendar over the googleapis transport', () => {
    it('exchanges the refresh token, inserts the event and stores the returned ID', async () => {
        const operator = await createUser('operator@example.com')
        await createMeeting('athens', { id: 'nov3_2026', dateTime: FUTURE(), agendaUrl: 'https://example.com/agenda.pdf' })
        await prisma.meetingOperator.create({ data: { meetingCityId: 'athens', meetingId: 'nov3_2026', userId: operator.id } })
        routes.push((req) => req.method === 'POST' && req.path === eventsPath ? { status: 200, body: { id: 'evt-created-1', status: 'confirmed' } } : undefined)

        await syncMeetingToCalendar('athens', 'nov3_2026', { allowCreate: true })

        expect(sendTaskAdminAlert).not.toHaveBeenCalled()

        const token = recorded.find((r) => r.host === 'oauth2.googleapis.com')!
        const form = new URLSearchParams(token.body)
        expect(form.get('grant_type')).toBe('refresh_token')
        expect(form.get('refresh_token')).toBe('refresh-token')
        expect(form.get('client_id')).toBe('client-id')
        expect(form.get('client_secret')).toBe('client-secret')

        const [insert] = calendarRequests()
        expect(calendarRequests()).toHaveLength(1)
        expect(insert.method).toBe('POST')
        expect(insert.path).toBe(eventsPath)
        expect(insert.query.get('sendUpdates')).toBe('all')
        expect(insert.headers.authorization).toBe('Bearer access-token-1')
        const event = JSON.parse(insert.body)
        expect(event).toMatchObject({
            summary: expect.stringContaining('Αθήνα'),
            description: expect.stringContaining('https://example.com/agenda.pdf'),
            start: { timeZone: 'Europe/Athens', dateTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/) },
            end: { timeZone: 'Europe/Athens' },
            visibility: 'public',
            attendees: [{ email: 'operator@example.com' }],
            guestsCanSeeOtherGuests: false,
            status: 'confirmed',
        })

        const stored = await prisma.councilMeeting.findUnique({ where: { cityId_id: { cityId: 'athens', id: 'nov3_2026' } } })
        expect(stored?.calendarEventId).toBe('evt-created-1')
    })

    it('patches a stored event of a past meeting without emailing attendees', async () => {
        await createMeeting('athens', { id: 'oct1_2026', dateTime: PAST(), calendarEventId: 'evt-existing' })
        routes.push((req) => req.method === 'PATCH' ? { status: 200, body: { id: 'evt-existing' } } : undefined)

        await syncMeetingToCalendar('athens', 'oct1_2026')

        expect(sendTaskAdminAlert).not.toHaveBeenCalled()
        const [patch] = calendarRequests()
        expect(calendarRequests()).toHaveLength(1)
        expect(patch.method).toBe('PATCH')
        expect(patch.path).toBe(`${eventsPath}/evt-existing`)
        expect(patch.query.get('sendUpdates')).toBe('none')
        expect(JSON.parse(patch.body)).not.toHaveProperty('status')
    })

    it('reports a Google API error to the admins with its message', async () => {
        await createMeeting('athens', { id: 'nov4_2026', dateTime: FUTURE(), calendarEventId: 'evt-gone' })
        routes.push((req) => req.method === 'PATCH'
            ? { status: 404, body: { error: { code: 404, message: 'Not Found', errors: [{ domain: 'global', reason: 'notFound', message: 'Not Found' }] } } }
            : undefined)

        await syncMeetingToCalendar('athens', 'nov4_2026')

        expect(sendTaskAdminAlert).toHaveBeenCalledTimes(1)
        expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed',
            taskType: 'calendarSync',
            taskId: 'evt-gone',
            error: 'Not Found',
        }))
        // A 404 is not retried.
        expect(calendarRequests()).toHaveLength(1)
    })

    it('deletes the created event again when storing its ID fails', async () => {
        await createMeeting('athens', { id: 'nov5_2026', dateTime: FUTURE() })
        routes.push(async (req) => {
            if (req.method !== 'POST' || req.path !== eventsPath) return undefined
            // The meeting disappears between the read and the write, so
            // setMeetingCalendarEventId fails after Google created the event.
            await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: 'athens', id: 'nov5_2026' } } })
            return { status: 200, body: { id: 'evt-orphan' } }
        })
        routes.push((req) => req.method === 'DELETE' ? { status: 204 } : undefined)

        await syncMeetingToCalendar('athens', 'nov5_2026', { allowCreate: true })

        const methods = calendarRequests().map((r) => `${r.method} ${r.path}`)
        expect(methods).toEqual([`POST ${eventsPath}`, `DELETE ${eventsPath}/evt-orphan`])
        expect(calendarRequests()[1].query.get('sendUpdates')).toBe('none')
        expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            taskId: 'evt-orphan',
            error: 'Created calendar event evt-orphan but failed to store its ID; the event was deleted again.',
        }))
    })

    it('gives up on a hung cleanup delete after one request timeout', async () => {
        await createMeeting('athens', { id: 'nov7_2026', dateTime: FUTURE() })
        routes.push(async (req) => {
            if (req.method !== 'POST' || req.path !== eventsPath) return undefined
            await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: 'athens', id: 'nov7_2026' } } })
            return { status: 200, body: { id: 'evt-stuck' } }
        })
        routes.push((req) => req.method === 'DELETE' ? 'hang' : undefined)

        const started = Date.now()
        await syncMeetingToCalendar('athens', 'nov7_2026', { allowCreate: true })
        const elapsed = Date.now() - started

        // gaxios retries a timed-out DELETE by default, which would triple
        // the bound. The cleanup must make one attempt only.
        const methods = calendarRequests().map((r) => `${r.method} ${r.path}`)
        expect(methods).toEqual([`POST ${eventsPath}`, `DELETE ${eventsPath}/evt-stuck`])
        expect(elapsed).toBeGreaterThanOrEqual(9_000)
        expect(elapsed).toBeLessThan(20_000)
        expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            taskId: 'evt-stuck',
            error: 'Created calendar event evt-stuck but failed to store its ID; the event is still on the calendar and an admin must delete it.',
        }))
    }, 60_000)

    it('gives up on a hung request after the request timeout and reports it', async () => {
        await createMeeting('athens', { id: 'nov6_2026', dateTime: FUTURE(), calendarEventId: 'evt-slow' })
        routes.push((req) => req.method === 'PATCH' ? 'hang' : undefined)

        const started = Date.now()
        await syncMeetingToCalendar('athens', 'nov6_2026')
        const elapsed = Date.now() - started

        expect(sendTaskAdminAlert).toHaveBeenCalledTimes(1)
        expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'evt-slow' }))
        // CALENDAR_REQUEST_TIMEOUT_MS is 10s. The bound must hold, with no
        // silent retries that multiply it.
        expect(elapsed).toBeGreaterThanOrEqual(9_000)
        expect(elapsed).toBeLessThan(20_000)
        expect(calendarRequests()).toHaveLength(1)
    }, 60_000)
})
