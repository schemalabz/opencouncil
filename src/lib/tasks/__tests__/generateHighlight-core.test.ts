/** @jest-environment node */
// The speaker overlay label (roleLabel) sent to the highlight renderer, in the city's language.

const mockFindUnique = jest.fn();
const mockStartTask = jest.fn().mockResolvedValue({ id: 'task-1' });

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { highlight: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
// The catalog of the locale asked for: a hard-coded locale fails the French case.
jest.mock('next-intl/server', () => ({
    getTranslations: (o: { locale: string; namespace: string }) =>
        jest.requireActual('../../../../tests/helpers/catalog').getTranslationsFromCatalog(o),
}));

import { requestGenerateHighlightCore } from '../generateHighlight-core';

const MEETING_DATE = new Date('2026-03-04T18:00:00Z');

function role(overrides: Record<string, unknown>) {
    return {
        id: 'r', personId: 'p1', cityId: null, partyId: null, party: null,
        administrativeBodyId: null, administrativeBody: null,
        isHead: false, name: null, name_en: null, startDate: null, endDate: null, rank: null,
        ...overrides,
    };
}

function highlightWith(language: string, roles: Record<string, unknown>[]) {
    return {
        id: 'h1', meetingId: 'm1', cityId: 'c1',
        meeting: { videoUrl: 'https://v/x.mp4', dateTime: MEETING_DATE, city: { language } },
        highlightedUtterances: [{
            utterance: {
                id: 'u1', startTimestamp: 1, endTimestamp: 2, text: 'x',
                speakerSegment: { speakerTag: { label: 'S0', person: { id: 'p1', name: 'A', roles } } },
            },
        }],
    };
}

async function roleLabel(language: string, roles: Record<string, unknown>[]) {
    mockFindUnique.mockResolvedValue(highlightWith(language, roles));
    await requestGenerateHighlightCore('h1');
    const body = mockStartTask.mock.calls.at(-1)![1];
    return body.parts[0].utterances[0].speaker.roleLabel;
}

const councilSeat = role({ id: 'seat', administrativeBodyId: 'council', administrativeBody: { type: 'council' } });

describe('requestGenerateHighlightCore speaker overlay', () => {
    beforeEach(() => jest.clearAllMocks());

    it('labels an independent councillor', async () => {
        expect(await roleLabel('el', [councilSeat])).toBe('Ανεξάρτητος Δημοτικός Σύμβουλος');
    });

    it('labels the independent councillor in the city language', async () => {
        expect(await roleLabel('fr', [councilSeat])).toBe('Conseiller municipal indépendant');
    });

    it('gives a party member no role label', async () => {
        const party = { id: 'pa', name: 'Π', name_short: 'Π', colorHex: '#000' };
        expect(await roleLabel('el', [councilSeat, role({ id: 'pr', partyId: 'pa', party })])).toBeUndefined();
    });

    it('titles a nameless council president, and keeps a deputy mayor portfolio unsimplified', async () => {
        expect(await roleLabel('el', [role({ id: 'h', administrativeBodyId: 'council', administrativeBody: { type: 'council' }, isHead: true })])).toBe('Πρόεδρος');
        expect(await roleLabel('el', [role({ id: 'd', cityId: 'c1', name: 'Αντιδήμαρχος Οικονομικών' })])).toBe('Αντιδήμαρχος Οικονομικών');
    });
});
