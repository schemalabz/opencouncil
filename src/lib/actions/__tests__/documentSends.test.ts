/** @jest-environment node */
const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockAuth(...a),
    getCurrentUser: (...a: unknown[]) => mockCurrentUser(...a),
}));
const mockFacts = jest.fn();
jest.mock('@/lib/db/documentSends', () => ({ getReadinessFacts: (...a: unknown[]) => mockFacts(...a) }));
const mockSend = jest.fn();
jest.mock('@/lib/documents/send', () => ({ sendDocument: (...a: unknown[]) => mockSend(...a) }));

import type { DocumentKind } from '@prisma/client';
import { getDocumentState, previewDocumentSend, sendDocumentNow } from '../documentSends';
import { readinessFacts, reviewTask, setting } from '@/lib/documents/__tests__/factsFixture';

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // before the threshold, whatever day the test runs

/** A reviewed, summarized meeting two days ago, with one subject undecided. */
function facts(overrides: Parameters<typeof readinessFacts>[0] = {}) {
    return readinessFacts({
        dateTime: twoDaysAgo,
        administrativeBody: { type: 'council' as const, documentSendSettings: [setting('transcript', { recipientEmails: ['to@x.org'] }), setting('minutes', { recipientEmails: ['to@x.org'] })] },
        ...overrides,
    });
}

const actions = [
    ['getDocumentState', getDocumentState],
    ['previewDocumentSend', previewDocumentSend],
    ['sendDocumentNow', sendDocumentNow],
] as const;

beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(undefined);
    mockCurrentUser.mockResolvedValue({ id: 'u1' });
    mockFacts.mockResolvedValue(facts());
    mockSend.mockResolvedValue({ success: true, recipientEmails: ['to@x.org'] });
});

describe.each(actions)('%s checks its arguments', (_name, action) => {
    it.each([
        ['an unknown kind', 'c1', 'm1', 'agenda'],
        ['an empty city', '', 'm1', 'minutes'],
        ['an empty meeting', 'c1', '', 'minutes'],
    ])('rejects %s before it authorizes or reads', async (_case, cityId, meetingId, kind) => {
        await expect(action(cityId, meetingId, kind as DocumentKind)).rejects.toThrow();
        expect(mockAuth).not.toHaveBeenCalled();
        expect(mockFacts).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });
});

describe('sendDocumentNow', () => {
    it('authorizes a superadmin only, before it reads or sends', async () => {
        mockAuth.mockRejectedValue(new Error('Not authorized'));
        await expect(sendDocumentNow('c1', 'm1', 'minutes')).rejects.toThrow('Not authorized');
        expect(mockAuth).toHaveBeenCalledWith({});
        expect(mockCurrentUser).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends as the person who asked, and returns what the sender said', async () => {
        expect(await sendDocumentNow('c1', 'm1', 'minutes')).toEqual({ success: true, recipientEmails: ['to@x.org'] });
        expect(mockAuth).toHaveBeenCalledWith({});
        expect(mockSend).toHaveBeenCalledWith('c1', 'm1', 'minutes', { by: 'person', userId: 'u1' });
    });

    it('sends with no user id when the session has no user', async () => {
        mockCurrentUser.mockResolvedValue(null);
        await sendDocumentNow('c1', 'm1', 'transcript');
        expect(mockSend).toHaveBeenCalledWith('c1', 'm1', 'transcript', { by: 'person', userId: null });
    });
});

describe('previewDocumentSend', () => {
    it('authorizes a superadmin only, before it reads', async () => {
        mockAuth.mockRejectedValue(new Error('Not authorized'));
        await expect(previewDocumentSend('c1', 'm1', 'minutes')).rejects.toThrow('Not authorized');
        expect(mockAuth).toHaveBeenCalledWith({});
        expect(mockFacts).not.toHaveBeenCalled();
    });

    it('previews what a send by hand would carry: the provisional minutes before the threshold', async () => {
        expect(await previewDocumentSend('c1', 'm1', 'minutes')).toEqual({ recipientEmails: ['to@x.org'], readiness: { state: 'incomplete', missingSubjectIds: ['s2'] } });
        expect(mockAuth).toHaveBeenCalledWith({});
        expect(mockFacts).toHaveBeenCalledWith('c1', 'm1');
    });

    it('previews the refusal of a meeting that waits for its summarize', async () => {
        mockFacts.mockResolvedValue(facts({ taskStatuses: [reviewTask] }));
        expect(await previewDocumentSend('c1', 'm1', 'minutes')).toEqual({ recipientEmails: ['to@x.org'], readiness: { state: 'wait', reason: 'summarize', dueAt: null } });
    });

    it('previews nothing for a missing meeting', async () => {
        mockFacts.mockResolvedValue(null);
        expect(await previewDocumentSend('c1', 'm1', 'minutes')).toBeNull();
    });
});

describe('getDocumentState', () => {
    it('authorizes an editor of the city, before it reads', async () => {
        mockAuth.mockRejectedValue(new Error('Not authorized'));
        await expect(getDocumentState('c1', 'm1', 'minutes')).rejects.toThrow('Not authorized');
        expect(mockAuth).toHaveBeenCalledWith({ cityId: 'c1' });
        expect(mockFacts).not.toHaveBeenCalled();
    });

    it('returns the state of a document the body sends', async () => {
        expect(await getDocumentState('c1', 'm1', 'minutes')).toMatchObject({ state: 'waiting', waitReason: 'decisions' });
        expect(mockAuth).toHaveBeenCalledWith({ cityId: 'c1' });
    });

    it('returns null for a document the body does not send, and for a missing meeting', async () => {
        mockFacts.mockResolvedValue(facts({ administrativeBody: { type: 'council' as const, documentSendSettings: [setting('minutes', { enabled: false })] } }));
        expect(await getDocumentState('c1', 'm1', 'minutes')).toBeNull();
        mockFacts.mockResolvedValue(null);
        expect(await getDocumentState('c1', 'm1', 'minutes')).toBeNull();
    });
});
