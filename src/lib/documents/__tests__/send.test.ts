/** @jest-environment node */
const mockGetMeeting = jest.fn();
const mockGetSetting = jest.fn();
const mockClaim = jest.fn();
const mockSettle = jest.fn();
const mockMarkSending = jest.fn();
jest.mock('@/lib/db/documentSends', () => ({
    markDocumentSending: (...a: unknown[]) => mockMarkSending(...a),
    getMeetingForDocumentSend: (...a: unknown[]) => mockGetMeeting(...a),
    getDocumentSendSetting: (...a: unknown[]) => mockGetSetting(...a),
    claimDocumentSend: (...a: unknown[]) => mockClaim(...a),
    settleDocumentSend: (...a: unknown[]) => mockSettle(...a),
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

const meetingDate = new Date('2026-03-10T17:00:00Z');
const meeting = { id: 'm1', cityId: 'c1', dateTime: meetingDate, administrativeBodyId: 'b1', administrativeBody: { name: 'Body' }, city: { name_en: 'City', name_municipality: 'Δήμος' } };
const payload: DocumentPayload = { filename: 'minutes.docx', buffer: Buffer.from('DOCX'), subject: 'Πρακτικά', html: '<p/>' };
const opts = { trigger: 'complete' as const, automatic: true };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetMeeting.mockResolvedValue(meeting);
    mockGetSetting.mockResolvedValue({ enabled: true, enabledAt: null, recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'] });
    mockClaim.mockResolvedValue({ id: 'claim-1' });
    mockSettle.mockResolvedValue(true);
    mockMarkSending.mockResolvedValue(true);
    mockSendEmail.mockResolvedValue({ success: true });
    mockSentAlert.mockResolvedValue(undefined);
    mockFailedAlert.mockResolvedValue(undefined);
});

describe('sendDocument', () => {
    it('fails and alerts when the meeting is missing, and claims nothing', async () => {
        mockGetMeeting.mockResolvedValue(null);
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: false, error: 'Meeting not found: c1/m1' });
        expect(mockClaim).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledTimes(1);
    });

    it('skips without a claim when the document is switched off for the body', async () => {
        mockGetSetting.mockResolvedValue({ enabled: false, enabledAt: null, recipientEmails: ['to@x.org'] });
        const build = jest.fn();
        expect(await sendDocument('c1', 'm1', 'minutes', build, opts)).toEqual({ success: true, skipped: true });
        expect(mockClaim).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
    });

    it('skips without rendering or emailing when the slot is taken', async () => {
        mockClaim.mockResolvedValue('taken');
        const build = jest.fn();
        expect(await sendDocument('c1', 'm1', 'minutes', build, opts)).toEqual({ success: true, skipped: true });
        expect(build).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockSettle).not.toHaveBeenCalled();
    });

    it('claims before it renders, with the completeness of the send', async () => {
        const order: string[] = [];
        mockClaim.mockImplementation(async () => { order.push('claim'); return { id: 'claim-1' }; });
        await sendDocument('c1', 'm1', 'minutes', async () => { order.push('render'); return payload; },
            { trigger: 'threshold', automatic: true, completeness: { complete: false, missingSubjectIds: ['s1', 's2'] } });
        expect(order).toEqual(['claim', 'render']);
        expect(mockClaim).toHaveBeenCalledWith({
            cityId: 'c1', councilMeetingId: 'm1', document: 'minutes', trigger: 'threshold', automatic: true,
            recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'], complete: false, missingSubjectIds: ['s1', 's2'],
        });
        expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ missingSubjects: 2, trigger: 'threshold' }));
    });

    it('settles a render failure as failed, never emails, and alerts', async () => {
        const result = await sendDocument('c1', 'm1', 'minutes', async () => { throw new Error('no data'); }, opts);
        expect(result).toEqual({ success: false, error: 'no data' });
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'failed', failureReason: 'no data' });
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledTimes(1);
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    it('settles an email the provider refused as failed with its message', async () => {
        mockSendEmail.mockResolvedValue({ success: false, message: 'rate limited', outcome: 'rejected' });
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: false, error: 'rate limited' });
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'failed', failureReason: 'rate limited' });
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    // The provider's answer was lost: the email may have gone out
    it('leaves the claim sending when the email outcome is unknown, and alerts', async () => {
        mockSendEmail.mockResolvedValue({ success: false, message: 'Failed to send email', outcome: 'unknown' });

        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);

        expect(result).toEqual({ success: false, error: expect.stringContaining('no clear answer') });
        expect(mockSettle).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('stays unconfirmed') }));
        expect(mockSentAlert).not.toHaveBeenCalled();
    });

    it('emails To the first address, CC the rest, with the DOCX attached, then settles as sent', async () => {
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: true, recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'] });
        expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
            from: 'operations', to: 'to@x.org', cc: ['cc1@x.org', 'cc2@x.org'], subject: 'Πρακτικά', html: '<p/>',
            attachments: [{ filename: 'minutes.docx', content: payload.buffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
        }));
        expect(mockSettle).toHaveBeenCalledWith('claim-1', { status: 'sent', sentAt: expect.any(Date) });
        expect(mockSentAlert).toHaveBeenCalledWith(expect.objectContaining({ missingSubjects: 0, recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'] }));
    });

    it('marks the claim sending after the render and before the email', async () => {
        const order: string[] = [];
        mockMarkSending.mockImplementation(async () => { order.push('sending'); return true; });
        mockSendEmail.mockImplementation(async () => { order.push('email'); return { success: true }; });

        await sendDocument('c1', 'm1', 'minutes', async () => { order.push('render'); return payload; }, opts);

        expect(order).toEqual(['render', 'sending', 'email']);
        expect(mockMarkSending).toHaveBeenCalledWith('claim-1');
    });

    it('emails nothing when the claim was released as stale during the render', async () => {
        mockMarkSending.mockResolvedValue(false);

        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);

        expect(result).toEqual({ success: false, error: 'The claim was released as stale before the email went out' });
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockFailedAlert).toHaveBeenCalledTimes(1);
    });

    it('sends no CC field for a single recipient', async () => {
        mockGetSetting.mockResolvedValue({ enabled: true, enabledAt: null, recipientEmails: ['to@x.org'] });
        await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(mockSendEmail.mock.calls[0][0].cc).toBeUndefined();
    });

    it('never throws: an error before the email is reported, even when the alert fails too', async () => {
        mockSendEmail.mockRejectedValue(new Error('network down'));
        mockFailedAlert.mockRejectedValue(new Error('discord down'));
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: false, error: 'network down' });
    });

    it('retries the record of a sent email once, and reports the send as sent', async () => {
        mockSettle.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(true);
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: true, recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'] });
        expect(mockSettle).toHaveBeenCalledTimes(2);
        expect(mockFailedAlert).not.toHaveBeenCalled();
    });

    it('never reports a sent email as failed: a record that cannot be written gets its own alert', async () => {
        mockSettle.mockRejectedValue(new Error('db down'));
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result).toEqual({ success: true, recipientEmails: ['to@x.org', 'cc1@x.org', 'cc2@x.org'] });
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('The email went out, but the send was not recorded (db down)') }));
        expect(mockSentAlert).toHaveBeenCalledTimes(1);
    });

    it('says so when the claim was released as stale before the send was recorded', async () => {
        mockSettle.mockResolvedValue(false);
        const result = await sendDocument('c1', 'm1', 'minutes', async () => payload, opts);
        expect(result.success).toBe(true);
        expect(mockFailedAlert).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('released as stale') }));
    });
});
