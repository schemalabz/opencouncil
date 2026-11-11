/** @jest-environment node */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

jest.mock('@/env.mjs', () => ({
    env: { RESEND_API_KEY: 're_test_not_a_real_key', DEPLOYMENT_ENV: 'production', DEV_EMAIL_OVERRIDE: undefined },
}));

import { sendEmail, sendEmailBatch } from '@/lib/email/resend';

// These tests run the real `resend` SDK (sendEmail) and the real fetch (sendEmailBatch)
// against a local server that plays the Resend API. Requests for api.resend.com go to
// that server; a request for any other host fails the test, so no email can leave.

interface RecordedRequest {
    method: string;
    path: string;
    headers: IncomingHttpHeaders;
    body: unknown;
}

type Reply = { status: number; body: string; contentType?: string };

const RESEND_ORIGIN = 'https://api.resend.com';
const requests: RecordedRequest[] = [];
let nextReply: Reply;
let server: Server;
let localOrigin: string;
const realFetch = global.fetch;

beforeAll(async () => {
    server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            requests.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
            res.writeHead(nextReply.status, { 'Content-Type': nextReply.contentType ?? 'application/json' });
            res.end(nextReply.body);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    localOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    global.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith(RESEND_ORIGIN)) throw new Error(`Unexpected request to ${url}`);
        return realFetch(localOrigin + url.slice(RESEND_ORIGIN.length), init);
    }) as typeof fetch;
});

afterAll(async () => {
    global.fetch = realFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    requests.length = 0;
    nextReply = { status: 200, body: JSON.stringify({ id: 'email-1' }) };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('sendEmail through the resend SDK', () => {
    it('posts the message to /emails in the API field names', async () => {
        const docx = Buffer.from('docx bytes');
        const result = await sendEmail({
            from: 'operations',
            to: 'clerk@example.com',
            cc: ['a@example.com', 'bot@machines.opencouncil.invalid'],
            replyTo: 'hello@opencouncil.gr',
            subject: 'Απομαγνητοφώνηση',
            html: '<p>γεια</p>',
            text: 'γεια',
            tags: [{ name: 'kind', value: 'transcript' }],
            attachments: [{ filename: 'meeting.docx', content: docx, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
        });

        expect(result).toEqual({ success: true, message: 'Email sent successfully' });
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request.method).toBe('POST');
        expect(request.path).toBe('/emails');
        expect(request.headers.authorization).toBe('Bearer re_test_not_a_real_key');
        expect(request.headers['content-type']).toBe('application/json');
        expect(request.headers['user-agent']).toMatch(/^resend-node:/);
        expect(request.headers['idempotency-key']).toBeUndefined();
        const body = request.body as Record<string, unknown>;
        expect(body).toMatchObject({
            from: 'OpenCouncil <operations@opencouncil.gr>',
            to: 'clerk@example.com',
            cc: ['a@example.com'],
            reply_to: 'hello@opencouncil.gr',
            subject: 'Απομαγνητοφώνηση',
            html: '<p>γεια</p>',
            text: 'γεια',
            tags: [{ name: 'kind', value: 'transcript' }],
        });
        const [attachment] = body.attachments as Array<Record<string, unknown>>;
        expect(attachment.filename).toBe('meeting.docx');
        expect(attachment.content_type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        // A Buffer is sent as JSON `{ type: 'Buffer', data }` or, from resend 6.37, as base64.
        const content = attachment.content;
        const bytes = typeof content === 'string'
            ? Buffer.from(content, 'base64')
            : Buffer.from((content as { data: number[] }).data);
        expect(bytes.equals(docx)).toBe(true);
    });

    it('reports a failure when the API answers with an error', async () => {
        nextReply = { status: 422, body: JSON.stringify({ statusCode: 422, name: 'validation_error', message: 'Invalid `to` field.' }) };

        await expect(sendEmail({ from: 'notifications', to: 'not-an-address', subject: 's', html: '<p/>' }))
            .resolves.toEqual({ success: false, message: 'Failed to send email', outcome: 'rejected' });
        expect(requests).toHaveLength(1);
    });

    it('reports a failure when the API answers with a body that is not JSON', async () => {
        nextReply = { status: 502, body: '<html>Bad gateway</html>', contentType: 'text/html' };

        await expect(sendEmail({ from: 'notifications', to: 'anna@example.com', subject: 's', html: '<p/>' }))
            .resolves.toEqual({ success: false, message: 'Failed to send email', outcome: 'unknown' });
    });
});

describe('sendEmailBatch through fetch', () => {
    const items = [
        { from: 'notifications' as const, to: 'anna@example.com', replyTo: 'hello@opencouncil.gr', subject: 's1', html: '<p>1</p>' },
        { from: 'notifications' as const, to: 'bob@example.com', subject: 's2', html: '<p>2</p>', text: 't2' },
    ];

    it('posts the items to /emails/batch with the idempotency key and permissive validation', async () => {
        nextReply = { status: 200, body: JSON.stringify({ data: [{ id: 'e1' }, { id: 'e2' }], errors: [] }) };

        await expect(sendEmailBatch(items, { idempotencyKey: 'digest-2026-11-07' })).resolves.toEqual({ success: true, failedTos: [] });

        const [request] = requests;
        expect(request.path).toBe('/emails/batch');
        expect(request.headers.authorization).toBe('Bearer re_test_not_a_real_key');
        expect(request.headers['idempotency-key']).toBe('digest-2026-11-07');
        expect(request.headers['x-batch-validation']).toBe('permissive');
        expect(request.body).toEqual([
            { from: 'OpenCouncil <notifications@opencouncil.gr>', to: 'anna@example.com', reply_to: 'hello@opencouncil.gr', subject: 's1', html: '<p>1</p>' },
            { from: 'OpenCouncil <notifications@opencouncil.gr>', to: 'bob@example.com', subject: 's2', html: '<p>2</p>', text: 't2' },
        ]);
    });

    it('names the recipients that the API rejected one by one', async () => {
        nextReply = { status: 200, body: JSON.stringify({ data: [{ id: 'e1' }], errors: [{ index: 1, message: 'Invalid `to` field.' }] }) };

        await expect(sendEmailBatch(items, { idempotencyKey: 'k' })).resolves.toEqual({ success: false, failedTos: ['bob@example.com'] });
    });

    it('marks every recipient failed when the API rejects the batch', async () => {
        nextReply = { status: 429, body: JSON.stringify({ statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests.' }) };

        await expect(sendEmailBatch(items, { idempotencyKey: 'k' })).resolves.toEqual({
            success: false,
            failedTos: ['anna@example.com', 'bob@example.com'],
            error: 'Resend batch returned 429',
        });
    });
});
