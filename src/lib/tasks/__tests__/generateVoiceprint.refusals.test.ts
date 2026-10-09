/** @jest-environment node */
// A refusal must come back as a value: production Next replaces the message of
// a thrown error, so the admin would see no reason.
const mockPersonFindUnique = jest.fn();
const mockHasVoicePrintConsent = jest.fn();
const mockMeetingFindMany = jest.fn();
const mockStartTask = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args), findMany: jest.fn() },
        councilMeeting: { findMany: (...args: unknown[]) => mockMeetingFindMany(...args) },
    },
}));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn(async () => true) }));
jest.mock('../tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('@/lib/db/voicePrintConsentRule', () => ({
    ...jest.requireActual('@/lib/db/voicePrintConsentRule'),
    hasVoicePrintConsent: (...args: unknown[]) => mockHasVoicePrintConsent(...args),
}));

import { requestGenerateVoiceprint } from '../generateVoiceprint';

it('refuses, as a value, a chosen segment whose meeting has no media to cut it from, before any task starts', async () => {
    mockHasVoicePrintConsent.mockResolvedValue(true);
    mockPersonFindUnique
        .mockResolvedValueOnce({ id: 'p1', roles: [], voicePrintConsents: [], administrators: [] })
        .mockResolvedValueOnce({
            speakerTags: [{ personSetBy: 'user', createdAt: new Date(), speakerSegments: [{ id: 's1', cityId: 'chania', meetingId: 'm1', startTimestamp: 0, endTimestamp: 60, meeting: { taskStatuses: [] } }] }],
        });
    mockMeetingFindMany.mockResolvedValue([{ id: 'm1', cityId: 'chania', audioUrl: null, videoUrl: null, name: 'M1', dateTime: new Date(), city: { timezone: 'Europe/Athens' } }]);

    await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual({
        ok: false,
        message: expect.stringContaining('cannot become the person\'s voiceprint'),
    });
    expect(mockStartTask).not.toHaveBeenCalled();
});
