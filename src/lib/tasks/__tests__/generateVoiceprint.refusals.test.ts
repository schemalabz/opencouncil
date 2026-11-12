/** @jest-environment node */
// A plain Error for "too short" would be rethrown, and production Next
// replaces its message, so the admin would see no reason.
const mockPersonFindUnique = jest.fn();
const mockHasVoicePrintConsent = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args), findMany: jest.fn() } },
}));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn(async () => true) }));
jest.mock('../tasks', () => ({ startTask: jest.fn() }));
jest.mock('@/lib/db/voicePrintConsentRule', () => ({
    ...jest.requireActual('@/lib/db/voicePrintConsentRule'),
    hasVoicePrintConsent: (...args: unknown[]) => mockHasVoicePrintConsent(...args),
}));

import { requestGenerateVoiceprint } from '../generateVoiceprint';

it('refuses, as a value, a person whose longest usable segment is under 30 seconds', async () => {
    mockHasVoicePrintConsent.mockResolvedValue(true);
    mockPersonFindUnique
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
            speakerTags: [{ personSetBy: 'user', createdAt: new Date(), speakerSegments: [{ id: 's1', cityId: 'chania', meetingId: 'm1', startTimestamp: 0, endTimestamp: 20, meeting: { taskStatuses: [] } }] }],
        });

    await expect(requestGenerateVoiceprint('p1')).resolves.toEqual({
        ok: false,
        message: expect.stringMatching(/too short \(20\.0s\)/),
    });
});
