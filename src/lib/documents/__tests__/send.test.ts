/** @jest-environment node */
const mockGetFacts = jest.fn();
const mockGetMeeting = jest.fn();
const mockBeingWritten = jest.fn();
const mockClaim = jest.fn();
const mockSettle = jest.fn();
const mockMarkSending = jest.fn();
jest.mock('@/lib/db/documentSends', () => ({
    getReadinessFacts: (...a: unknown[]) => mockGetFacts(...a),
    getMeetingForDocumentSend: (...a: unknown[]) => mockGetMeeting(...a),
    isMeetingBeingWritten: (...a: unknown[]) => mockBeingWritten(...a),
    claimDocumentSend: (...a: unknown[]) => mockClaim(...a),
    markDocumentSending: (...a: unknown[]) => mockMarkSending(...a),
    settleDocumentSend: (...a: unknown[]) => mockSettle(...a),
}));
const mockPayload = jest.fn();
jest.mock('../registry', () => ({
    documents: {
        minutes: { payload: (...a: unknown[]) => mockPayload(...a) },
        transcript: { payload: (...a: unknown[]) => mockPayload(...a) },
    },
}));
const mockSendEmail = jest.fn();
jest.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));
const mockSentAlert = jest.fn();
const mockFailedAlert = jest.fn();
jest.mock('@/lib/discord', () => ({
    sendDocumentSentAdminAlert: (...a: unknown[]) => mockSentAlert(...a),
    sendDocumentSendFailedAdminAlert: (...a: unknown[]) => mockFailedAlert(...a),
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/meetingName', () => ({ meetingLabelInCity: () => 'Meeting label' }));

import { sendDocument, type DocumentPayload } from '../send';
import { MAX_AUTOMATIC_ATTEMPTS } from '../settings';
import { documentSend, readinessFacts, reviewTask, setting } from './factsFixture';

const meeting = { id: 'm1', cityId: 'c1', administrativeBodyId: 'b1', administrativeBody: { name: 'Body' }, city: { name_en: 'City', name_municipality: 'Δήμος' } };
const payload: DocumentPayload = { filename: 'minutes.docx', buffer: Buffer.from('DOCX'), subject: 'Πρακτικά', html: '<p/>' };
const recipients = ['to@x.org', 'cc1@x.org', 'cc2@x.org'];
const decided = [{ id: 's1', decision: { id: 'd1' } }, { id: 's2', decision: { id: 'd2' } }];
const automatic = { by: 'automatic' } as const;
const person = { by: 'person', userId: 'u1' } as const;

/** A reviewed, summarized meeting, long past its threshold, whose minutes are complete. */
function facts(overrides: Parameters<typeof readinessFacts>[0] = {}) {
    return readinessFacts({
        administrativeBody: { type: 'council' as const, documentSendSettings: [setting('transcript', { recipientEmails: recipients }), setting('minutes', { recipientEmails: recipients })] },
        subjects: decided,
        ...overrides,
    });
}

/** A meeting an hour ago: before the threshold, whatever day the test runs. */
const recentMeeting = () => new Date(Date.now() - 60 * 60 * 1000);

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetFacts.mockResolvedValue(facts());
    mockGetMeeting.mockResolvedValue(meeting);
    mockBeingWritten.mockResolvedValue(false);
    mockPayload.mockResolvedValue(payload);
    mockClaim.mockResolvedValue({ id: 'claim-1' });
    mockSettle.mockResolvedValue(true);
    mockMarkSending.mockResolvedValue(true);
    mockSendEmail.mockResolvedValue({ success: true });
    mockSentAlert.mockResolvedValue(undefined);
    mockFailedAlert.mockResolvedValue(undefined);
});

describe('sendDocument', () => {
    describe('the rule, read right before the claim', () => {
        it('fails and alerts when the meeting is missing, and claims nothing', async () => {
            mockGetFacts.mockResolvedValue(null);
            mockGetMeeting.mockResolvedValue(null);
            const result = await sendDocument('c1', 'm1', 'minutes', automatic);
            expect(result).toEqual({ success: false, error: 'Meeting not found: c1/m1' });
            expect(mockGetFacts).toHaveBeenCalledWith('c1', 'm1');
            expect(mockClaim).not.toHaveBeenCalled();
            expect(mockFailedAlert).toHaveBeenCalledTimes(1);
        });

        it('skips without a claim when the document is switched off for the body', async () => {
            mockGetFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { enabled: false })] } }));
            expect(await sendDocument('c1', 'm1', 'minutes', automatic))
                .toEqual({ success: true, skipped: true, readiness: { state: 'none', reason: 'disabled' } });
            expect(mockClaim).not.toHaveBeenCalled();
            expect(mockPayload).not.toHaveBeenCalled();
        });

        it('skips an automatic minutes send for a meeting older than the switch-on, and lets a person send it', async () => {
            mockGetFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { enabledAt: new Date('2026-04-01T00:00:00Z'), recipientEmails: ['to@x.org'] })] } }));

            expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toMatchObject({ success: true, skipped: true, readiness: { state: 'none', reason: 'beforeSwitch' } });
            expect(mockClaim).not.toHaveBeenCalled();

            expect(await sendDocument('c1', 'm1', 'minutes', person)).toMatchObject({ success: true, recipientEmails: ['to@x.org'] });
            expect(mockClaim).toHaveBeenCalledTimes(1);
        });

        it('skips an automatic send that waits, without a claim', async () => {
            mockGetFacts.mockResolvedValue(facts({ taskStatuses: [reviewTask] }));
            expect(await sendDocument('c1', 'm1', 'minutes', automatic))
                .toEqual({ success: true, skipped: true, readiness: { state: 'wait', reason: 'summarize', dueAt: null } });
            expect(mockClaim).not.toHaveBeenCalled();
        });
    });

    describe('a send by a person', () => {
        it('refuses a send to a setting with no recipient, and claims nothing', async () => {
            mockGetFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { recipientEmails: [] })] } }));
            const result = await sendDocument('c1', 'm1', 'minutes', person);
            expect(result).toMatchObject({ success: false, refusal: 'disabled' });
            expect(mockClaim).not.toHaveBeenCalled();
        });

        it('returns the refusal and the readiness when the rule refuses, and claims nothing', async () => {
            mockGetFacts.mockResolvedValue(facts({ taskStatuses: [reviewTask] }));
            const result = await sendDocument('c1', 'm1', 'minutes', person);
            expect(result).toMatchObject({ success: false, refusal: 'summarize', readiness: { state: 'wait', reason: 'summarize' } });
            expect(result.error).toContain('summarize');
            expect(result.skipped).toBeUndefined();
            expect(mockClaim).not.toHaveBeenCalled();
            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it.each([
            ['review', { taskStatuses: [] }],
            ['agenda', { subjects: [], _count: { subjects: 0 } }],
            ['laterPart', { continuationOfId: 'first', kind: null, continuationOf: { kind: 'ordinary' as const } }],
            ['notHeld', { scheduleStatus: 'cancelled' as const }],
        ])('refuses with %s', async (reason, overrides) => {
            mockGetFacts.mockResolvedValue(facts(overrides));
            expect(await sendDocument('c1', 'm1', 'minutes', person)).toMatchObject({ success: false, refusal: reason });
            expect(mockClaim).not.toHaveBeenCalled();
        });

        it('sends provisional minutes before the threshold, as manual, with the missing subjects and who asked', async () => {
            mockGetFacts.mockResolvedValue(facts({ dateTime: recentMeeting(), subjects: [{ id: 's1', decision: { id: 'd1' } }, { id: 's2', decision: null }] }));
            const result = await sendDocument('c1', 'm1', 'minutes', person);
            expect(result).toMatchObject({ success: true, readiness: { state: 'incomplete', missingSubjectIds: ['s2'] } });
            expect(mockClaim).toHaveBeenCalledWith({
                cityId: 'c1', councilMeetingId: 'm1', kind: 'minutes', trigger: 'manual',
                recipientEmails: recipients, missingSubjectIds: ['s2'], createdById: 'u1',
            });
            expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', missingSubjects: 1 }));
        });

        it('records no creator when the session has no user', async () => {
            await sendDocument('c1', 'm1', 'minutes', { by: 'person', userId: null });
            expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', createdById: null }));
        });

        it('sends again after a send that went out, and while a task writes the meeting', async () => {
            mockGetFacts.mockResolvedValue(facts({ documentSends: [documentSend()] }));
            mockBeingWritten.mockResolvedValue(true);
            expect(await sendDocument('c1', 'm1', 'minutes', person)).toMatchObject({ success: true });
            expect(mockClaim).toHaveBeenCalledTimes(1);
            expect(mockBeingWritten).not.toHaveBeenCalled();
        });
    });

    describe('an automatic send', () => {
        it('records the complete trigger, no missing subject and no creator', async () => {
            const result = await sendDocument('c1', 'm1', 'minutes', automatic);
            expect(result).toEqual({ success: true, readiness: { state: 'complete' }, recipientEmails: recipients });
            expect(mockClaim).toHaveBeenCalledWith({
                cityId: 'c1', councilMeetingId: 'm1', kind: 'minutes', trigger: 'complete',
                recipientEmails: recipients, missingSubjectIds: [], createdById: null,
            });
        });

        it('records the threshold trigger and passes the missing subjects to the claim', async () => {
            mockGetFacts.mockResolvedValue(facts({ subjects: [{ id: 's1', decision: null }, { id: 's2', decision: { id: 'd2' } }, { id: 's3', decision: null }] }));
            await sendDocument('c1', 'm1', 'minutes', automatic);
            expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'threshold', missingSubjectIds: ['s1', 's3'], createdById: null }));
            expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ missingSubjects: 2, trigger: 'threshold' }));
        });

        it('skips a document that went out or is going out, without a claim', async () => {
            mockGetFacts.mockResolvedValue(facts({ documentSends: [documentSend({ trigger: 'manual' })] }));
            expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toMatchObject({ success: true, skipped: true });
            expect(mockClaim).not.toHaveBeenCalled();
        });

        it('skips a document whose automatic attempts are used up', async () => {
            const failed = Array.from({ length: MAX_AUTOMATIC_ATTEMPTS }, (_, i) => documentSend({ id: `f${i}`, status: 'failed', sentAt: null }));
            mockGetFacts.mockResolvedValue(facts({ documentSends: failed }));
            expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toMatchObject({ success: true, skipped: true });
            expect(mockClaim).not.toHaveBeenCalled();
        });

        it('skips while a task writes the meeting, and asks with the meeting and the time', async () => {
            mockBeingWritten.mockResolvedValue(true);
            expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toMatchObject({ success: true, skipped: true, readiness: { state: 'complete' } });
            expect(mockBeingWritten).toHaveBeenCalledWith('c1', 'm1', expect.any(Date));
            expect(mockClaim).not.toHaveBeenCalled();
        });
    });

    describe('the transcript at the review completion', () => {
        it('records the review trigger, and does not ask whether a task writes the meeting', async () => {
            mockBeingWritten.mockResolvedValue(true);
            const result = await sendDocument('c1', 'm1', 'transcript', { by: 'review' });
            expect(result).toMatchObject({ success: true, recipientEmails: recipients });
            expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ kind: 'transcript', trigger: 'review', missingSubjectIds: [], createdById: null }));
        });
    });

    it('skips an automatic send when the setting has no recipient', async () => {
        mockGetFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { recipientEmails: [] })] } }));
        expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toMatchObject({ success: true, skipped: true });
        expect(mockClaim).not.toHaveBeenCalled();
    });

    it('skips without rendering or emailing when the slot is taken', async () => {
        mockClaim.mockResolvedValue('taken');
        expect(await sendDocument('c1', 'm1', 'minutes', automatic)).toEqual({ success: true, skipped: true, readiness: { state: 'complete' } });
        expect(mockPayload).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockSettle).not.toHaveBeenCalled();
    });

    it('claims before it renders, and renders with the meeting and the readiness of the claim', async () => {
        const order: string[] = [];
        mockClaim.mockImplementation(async () => { order.push('claim'); return { id: 'claim-1' }; });
        mockPayload.mockImplementation(async () => { order.push('render'); return payload; });
        await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(order).toEqual(['claim', 'render']);
        expect(mockPayload).toHaveBeenCalledWith(meeting, { state: 'complete' });
    });

    it('settles a render failure as failed, never emails, and alerts', async () => {
        mockPayload.mockRejectedValue(new Error('no data'));
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toEqual({ success: false, readiness: { state: 'complete' }, error: 'no data' });
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'failed', failureReason: 'no data' });
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledTimes(1);
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    it('settles an email the provider refused as failed with its message', async () => {
        mockSendEmail.mockResolvedValue({ success: false, message: 'rate limited', outcome: 'rejected' });
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toMatchObject({ success: false, error: 'rate limited' });
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'failed', failureReason: 'rate limited' });
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    // The provider's answer was lost: the email may have gone out
    it('leaves the claim sending when the email outcome is unknown, and alerts', async () => {
        mockSendEmail.mockResolvedValue({ success: false, message: 'Failed to send email', outcome: 'unknown' });

        const result = await sendDocument('c1', 'm1', 'minutes', automatic);

        expect(result).toMatchObject({ success: false, error: expect.stringContaining('no clear answer') });
        expect(mockSettle).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('stays unconfirmed') }));
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    it('emails To the first address, CC the rest, with the DOCX attached, then settles as sent', async () => {
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toMatchObject({ success: true, recipientEmails: recipients });
        expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
            from: 'operations', to: 'to@x.org', cc: ['cc1@x.org', 'cc2@x.org'], subject: 'Πρακτικά', html: '<p/>',
            attachments: [{ filename: 'minutes.docx', content: payload.buffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
        }));
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'sent', sentAt: expect.any(Date) });
        expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ missingSubjects: 0, recipientEmails: recipients }));
    });

    it('marks the claim sending after the render and before the email', async () => {
        const order: string[] = [];
        mockPayload.mockImplementation(async () => { order.push('render'); return payload; });
        mockMarkSending.mockImplementation(async () => { order.push('sending'); return true; });
        mockSendEmail.mockImplementation(async () => { order.push('email'); return { success: true }; });

        await sendDocument('c1', 'm1', 'minutes', automatic);

        expect(order).toEqual(['render', 'sending', 'email']);
        expect(mockMarkSending).toHaveBeenCalledWith('claim-1');
    });

    it('emails nothing when the claim was released as stale during the render', async () => {
        mockMarkSending.mockResolvedValue(false);

        const result = await sendDocument('c1', 'm1', 'minutes', automatic);

        expect(result).toMatchObject({ success: false, error: 'The claim was released as stale before the email went out' });
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledTimes(1);
    });

    it('sends no CC field for a single recipient', async () => {
        mockGetFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { recipientEmails: ['to@x.org'] })] } }));
        await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(mockSendEmail.mock.calls[0][0].cc).toBeUndefined();
    });

    it('never throws: an error before the email is reported, even when the alert fails too', async () => {
        mockSendEmail.mockRejectedValue(new Error('network down'));
        mockFailedAlert.mockRejectedValue(new Error('discord down'));
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toEqual({ success: false, error: 'network down' });
    });

    it('retries the record of a sent email once, and reports the send as sent', async () => {
        mockSettle.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(true);
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toMatchObject({ success: true, recipientEmails: recipients });
        expect(mockSettle).toHaveBeenCalledTimes(2);
        expect(mockFailedAlert).not.toHaveBeenCalled();
    });

    it('never reports a sent email as failed: a record that cannot be written gets its own alert', async () => {
        mockSettle.mockRejectedValue(new Error('db down'));
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result).toMatchObject({ success: true, recipientEmails: recipients });
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('The email went out, but the send was not recorded (db down)') }));
        expect(mockSentAlert).toHaveBeenCalledTimes(1);
    });

    it('says so when the claim was released as stale before the send was recorded', async () => {
        mockSettle.mockResolvedValue(false);
        const result = await sendDocument('c1', 'm1', 'minutes', automatic);
        expect(result.success).toBe(true);
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('released as stale') }));
    });
});
