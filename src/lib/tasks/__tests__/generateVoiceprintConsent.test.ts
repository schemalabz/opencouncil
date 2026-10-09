/** @jest-environment node */

const mockPersonFindUnique = jest.fn();
const mockPersonFindMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        person: {
            findUnique: (...args: unknown[]) => mockPersonFindUnique(...args),
            findMany: (...args: unknown[]) => mockPersonFindMany(...args),
        },
    },
}));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }));
jest.mock('../tasks', () => ({ startTask: jest.fn() }));
jest.mock('@/lib/db/voiceprintsCreate', () => ({ createVoicePrintDirect: jest.fn() }));
// The consent in force (#858) is its own rule, tested in generateVoiceprint.consent.test.ts: here it holds.
jest.mock('@/lib/db/voicePrintConsentRule', () => ({
    ...jest.requireActual('@/lib/db/voicePrintConsentRule'),
    hasVoicePrintConsent: jest.fn().mockResolvedValue(true),
}));

import { findEligiblePeopleForVoiceprintGeneration, requestGenerateVoiceprint } from '../generateVoiceprint';

const youthOnly = { roles: [{ administrativeBody: { type: 'youthCouncil' } }], administrators: [{ userId: 'own' }] };
const councillor = { roles: [{ administrativeBody: { type: 'council' } }], administrators: [] };
/** A consent from the account that claimed the page, and one from a delegate. */
const ownConsent = [{ userId: 'own' }];
const delegateConsent = [{ userId: 'assistant' }];
/** A segment long enough for a voiceprint, from a tag the admin set. */
const longTag = {
    personSetBy: 'admin', createdAt: new Date('2026-01-01'),
    speakerSegments: [{ id: 's1', startTimestamp: 0, endTimestamp: 60, meeting: { taskStatuses: [] } }],
};

beforeEach(() => jest.clearAllMocks());

describe('requestGenerateVoiceprint and the own consent of a secondary body member (#829)', () => {
    const ownAccountRefusal = expect.objectContaining({ ok: false, message: expect.stringContaining('own account') });

    it('refuses a member of a youth council alone who gave no consent from their account', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ ...youthOnly, voicePrintConsents: [] });
        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual(ownAccountRefusal);
        expect(mockPersonFindUnique).toHaveBeenCalledTimes(1);
    });

    it('refuses such a member whose only consent a delegate gave', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ ...youthOnly, voicePrintConsents: delegateConsent });
        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual(ownAccountRefusal);
    });

    it('goes on for such a member with a consent from their account, and for a councillor whose consent a superadmin recorded', async () => {
        // The second lookup is the sample search; no tags means the next refusal, which proves the first gate passed.
        const noSample = expect.objectContaining({ ok: false, message: expect.stringContaining('cannot become') });
        mockPersonFindUnique
            .mockResolvedValueOnce({ ...youthOnly, voicePrintConsents: ownConsent })
            .mockResolvedValueOnce({ speakerTags: [] });
        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual(noSample);

        mockPersonFindUnique
            .mockResolvedValueOnce({ ...councillor, voicePrintConsents: [] })
            .mockResolvedValueOnce({ speakerTags: [] });
        await expect(requestGenerateVoiceprint('p2', 's1')).resolves.toEqual(noSample);
    });

    it('leaves such a member out of the bulk list until they consent', async () => {
        mockPersonFindMany.mockResolvedValue([
            { id: 'p1', name: 'Μαρία', ...youthOnly, voicePrintConsents: [], speakerTags: [longTag] },
            { id: 'p2', name: 'Γιώργος', ...youthOnly, voicePrintConsents: ownConsent, speakerTags: [longTag] },
            { id: 'p3', name: 'Νίκος', ...councillor, voicePrintConsents: [], speakerTags: [longTag] },
            { id: 'p4', name: 'Ελένη', ...youthOnly, voicePrintConsents: delegateConsent, speakerTags: [longTag] },
        ]);

        const { eligiblePeople } = await findEligiblePeopleForVoiceprintGeneration('chania');

        expect(eligiblePeople.map(person => person.id)).toEqual(['p2', 'p3']);
    });
});
