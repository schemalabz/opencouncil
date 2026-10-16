/** @jest-environment node */
const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: (...a: unknown[]) => mockAuth(...a) }));
const mockFacts = jest.fn();
jest.mock('@/lib/db/documentSends', () => ({ getReadinessFacts: (...a: unknown[]) => mockFacts(...a) }));
const mockSend = jest.fn();
jest.mock('@/lib/documents/send', () => ({ sendDocument: (...a: unknown[]) => mockSend(...a) }));
const mockPayload = jest.fn();
jest.mock('@/lib/documents/registry', () => ({ documents: { transcript: { payload: (...a: unknown[]) => mockPayload(...a) }, minutes: { payload: (...a: unknown[]) => mockPayload(...a) } } }));

import type { ReadinessFacts } from '@/lib/db/types';
import { previewDocumentSend, sendDocumentNow } from '../documentSends';

const meetingDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // two days ago: before the threshold
const setting = (document: 'transcript' | 'minutes', enabled = true) => ({ document, enabled, enabledAt: null, recipientEmails: ['to@x.org'] });

function facts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
    return {
        id: 'm1', cityId: 'c1', dateTime: meetingDate, scheduleStatus: 'scheduled', continuationOfId: null, kind: 'ordinary', continuationOf: null, city: { timezone: 'Europe/Athens' },
        administrativeBodyId: 'b1', administrativeBody: { documentSendSettings: [setting('transcript'), setting('minutes')] },
        taskStatuses: [{ id: 'r' }], subjects: [{ id: 's1', decision: { id: 'd' } }, { id: 's2', decision: null }], _count: { subjects: 2 }, documentSends: [], ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(undefined);
    mockFacts.mockResolvedValue(facts());
    mockSend.mockResolvedValue({ success: true });
});

describe('sendDocumentNow', () => {
    it('authorizes against the city before it reads or sends', async () => {
        mockAuth.mockRejectedValue(new Error('Not authorized'));
        await expect(sendDocumentNow('c1', 'm1', 'minutes')).rejects.toThrow('Not authorized');
        expect(mockAuth).toHaveBeenCalledWith({ cityId: 'c1' });
        expect(mockFacts).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends the provisional minutes by hand before the threshold, as a manual, repeatable send', async () => {
        await sendDocumentNow('c1', 'm1', 'minutes');
        expect(mockSend).toHaveBeenCalledWith('c1', 'm1', 'minutes', expect.any(Function), {
            trigger: 'manual', automatic: false, completeness: { complete: false, missingSubjectIds: ['s2'] },
        });
    });

    it('sends the complete minutes by hand before the threshold when every decision is in', async () => {
        mockFacts.mockResolvedValue(facts({ subjects: [{ id: 's1', decision: { id: 'd' } }] }));
        await sendDocumentNow('c1', 'm1', 'minutes');
        expect(mockSend.mock.calls[0][4]).toMatchObject({ completeness: { complete: true, missingSubjectIds: [] } });
    });

    it('hands the payload builder the readiness it sends', async () => {
        await sendDocumentNow('c1', 'm1', 'minutes');
        const build = mockSend.mock.calls[0][3];
        await build({ id: 'm1' });
        expect(mockPayload).toHaveBeenCalledWith({ id: 'm1' }, { state: 'incomplete', missingSubjectIds: ['s2'] });
    });

    it('refuses an unreviewed meeting', async () => {
        mockFacts.mockResolvedValue(facts({ taskStatuses: [] }));
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: false, error: 'The review of the meeting is not complete' });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses a document the setting does not cover', async () => {
        mockFacts.mockResolvedValue(facts({ administrativeBody: { documentSendSettings: [setting('minutes', false)] } }));
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: false, error: 'The minutes is not sent for this meeting (disabled)' });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses the minutes of a meeting with no agenda subjects, which would be empty', async () => {
        mockFacts.mockResolvedValue(facts({ subjects: [], _count: { subjects: 0 } }));
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: false, error: 'The meeting has no agenda subjects yet, so its minutes would be empty' });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends by hand a meeting held before the setting was switched on', async () => {
        const later = { ...setting('minutes'), enabledAt: new Date() };
        mockFacts.mockResolvedValue(facts({ administrativeBody: { documentSendSettings: [setting('transcript'), later] } }));
        await sendDocumentNow('c1', 'm1', 'minutes');
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('sends the transcript by hand before the review, and for a later part, as the transcript button always could', async () => {
        mockFacts.mockResolvedValue(facts({ taskStatuses: [], continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' } }));
        await sendDocumentNow('c1', 'm1', 'transcript');
        expect(mockSend).toHaveBeenCalledWith('c1', 'm1', 'transcript', expect.any(Function), {
            trigger: 'manual', automatic: false, completeness: { complete: true, missingSubjectIds: [] },
        });
    });

    it('never sends the minutes of a later part', async () => {
        mockFacts.mockResolvedValue(facts({ continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' } }));
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: false, error: 'The minutes is not sent for this meeting (laterPart)' });
    });

    it('refuses a missing meeting', async () => {
        mockFacts.mockResolvedValue(null);
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: false, error: 'Meeting not found: c1/m1' });
    });
});

describe('previewDocumentSend', () => {
    it('authorizes against the city and previews what a send by hand would carry', async () => {
        expect(await previewDocumentSend('c1', 'm1', 'minutes')).toEqual({ recipientEmails: ['to@x.org'], readiness: { state: 'incomplete', missingSubjectIds: ['s2'] } });
        expect(mockAuth).toHaveBeenCalledWith({ cityId: 'c1' });
    });
});
