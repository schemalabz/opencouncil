/** @jest-environment node */
const mockGetCouncilMeeting = jest.fn();
const mockGetTranscript = jest.fn();
const mockGetCity = jest.fn();
const mockGetPeopleForCity = jest.fn();
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: (...a: unknown[]) => mockGetCouncilMeeting(...a) }));
jest.mock('@/lib/db/transcript', () => ({ getTranscript: (...a: unknown[]) => mockGetTranscript(...a) }));
jest.mock('@/lib/db/cities', () => ({ getCity: (...a: unknown[]) => mockGetCity(...a) }));
jest.mock('@/lib/db/people', () => ({ getPeopleForCity: (...a: unknown[]) => mockGetPeopleForCity(...a) }));
// The real catalog of the locale the code asks for.
jest.mock('next-intl/server', () => ({
    getTranslations: (o: { locale: string; namespace: string }) =>
        jest.requireActual('../../../../tests/helpers/catalog').getTranslationsFromCatalog(o),
}));

import JSZip from 'jszip';
import { generateMeetingDocxBuffer } from '../meetings-server';
import { NotFoundError } from '@/lib/api/errors';

const chair = {
    id: 'p1', name: 'Marie Dupont', name_short: 'M. Dupont',
    roles: [{
        id: 'chair', personId: 'p1', cityId: null, partyId: null, party: null,
        administrativeBodyId: 'council', administrativeBody: { type: 'council' },
        isHead: true, name: null, name_en: null, startDate: null, endDate: null,
    }],
};

beforeEach(() => {
    mockGetCouncilMeeting.mockResolvedValue({ id: 'm1', cityId: 'rouen', name: 'Conseil municipal', dateTime: new Date('2026-04-27T16:00:00Z') });
    mockGetCity.mockResolvedValue({ id: 'rouen', name_municipality: 'Ville de Rouen', timezone: 'Europe/Paris', realm: 'france', language: 'fr' });
    mockGetPeopleForCity.mockResolvedValue([chair]);
    mockGetTranscript.mockResolvedValue([{
        id: 's1', startTimestamp: 5,
        speakerTag: { personId: 'p1', label: 'SPEAKER_00' },
        utterances: [{ text: 'La séance est ouverte.' }],
    }]);
});

describe('generateMeetingDocxBuffer', () => {
    it('titles the speakers in the city language, the language the municipality reads', async () => {
        const buffer = await generateMeetingDocxBuffer('rouen', 'm1');
        const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');

        expect(xml).toContain('>Président(e) </w:t>');
    });

    it('throws NotFoundError for a meeting with no transcript yet', async () => {
        mockGetTranscript.mockResolvedValue([]);

        await expect(generateMeetingDocxBuffer('rouen', 'm1')).rejects.toBeInstanceOf(NotFoundError);
    });
});
