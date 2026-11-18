/** @jest-environment node */
import { isValidElement, type ReactElement } from 'react';

// The image is drawn from the element tree: the test reads the tree, not the PNG.
const drawn: ReactElement[] = [];
jest.mock('next/og', () => ({
    ImageResponse: class {
        constructor(element: ReactElement) { drawn.push(element); }
        async arrayBuffer() { return new ArrayBuffer(1); }
    },
}));
jest.mock('next-intl/server', () => ({
    getTranslations: jest.fn(async () => (key: string, values?: { count?: number }) => values?.count === undefined ? key : `${key}=${values.count}`),
}));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn(async () => 'greece') }));
jest.mock('@/lib/db/cities', () => ({ getCity: jest.fn(), getPetitionedMapCitiesCached: jest.fn() }));
jest.mock('@/lib/db/people', () => ({ getPerson: jest.fn(), listPeopleOfCity: jest.fn() }));
jest.mock('@/lib/db/parties', () => ({ getParty: jest.fn(), getPartiesForCity: jest.fn() }));
jest.mock('@/lib/db/meetings', () => ({ getMeetingDataForOG: jest.fn() }));
jest.mock('@/lib/db/consultations', () => ({ getConsultationDataForOG: jest.fn() }));
jest.mock('@/lib/db/subject', () => ({ getLatestSubjectsForSpeaker: jest.fn() }));
jest.mock('@/lib/hotSubjectCards', () => ({ getHotSubjectCardsCached: jest.fn(async () => []) }));
jest.mock('@/lib/cache/queries', () => ({ getAboutPageStatsCached: jest.fn(), getAllCitiesMinimalCached: jest.fn(), getCityPetitionBucketCached: jest.fn() }));
jest.mock('@/lib/og/remoteImage', () => ({ getImageData: jest.fn(async () => null), getPublicImageData: jest.fn(async () => null), SEAL_BOX: {} }));
jest.mock('@/lib/og/portrait', () => ({ getPortraitData: jest.fn(async () => null) }));
jest.mock('@/lib/og/illustration', () => ({
    allIllustrated: jest.fn(() => true),
    getStaticIllustrations: jest.fn(),
    getSubjectIllustrations: jest.fn(async () => new Map()),
    ILLUSTRATION_BOX: { tile: {} },
}));
jest.mock('@/lib/og/subjectImage', () => ({ subjectOgElement: jest.fn() }));
jest.mock('@/lib/og/serverAssets', () => ({ LOGO_BLACK_DATA_URI: '', OG_FONTS: [] }));

import { GET } from '@/app/api/og/route';
import { getCity } from '@/lib/db/cities';
import { listPeopleOfCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';

/** Every string in an element tree, through the props of every element. */
function textsOf(node: unknown): string[] {
    if (typeof node === 'string') return [node];
    if (Array.isArray(node)) return node.flatMap(textsOf);
    if (isValidElement(node)) return Object.values(node.props as Record<string, unknown>).flatMap(textsOf);
    return [];
}

const city = { id: 'chania', name: 'Χανιά', name_en: 'Chania', logoImage: null, _count: { persons: 7, parties: 3, councilMeetings: 5 } };

describe('the OG images of a city read the reader default (#829)', () => {
    beforeEach(() => {
        drawn.length = 0;
        jest.clearAllMocks();
        (getCity as jest.Mock).mockResolvedValue(city);
    });

    it('draws the people count of the city image from the city counts, as the identity band shows it', async () => {
        const response = await GET(new Request('http://localhost/api/og?cityId=chania'));
        expect(response.status).toBe(200);
        expect(textsOf(drawn[0])).toEqual(expect.arrayContaining(['city.people=7', 'city.parties=3', 'city.meetings=5']));
    });

    it('draws the people image from the primary listing', async () => {
        (listPeopleOfCity as jest.Mock).mockResolvedValue([]);
        (getPartiesForCity as jest.Mock).mockResolvedValue([]);
        const response = await GET(new Request('http://localhost/api/og?cityId=chania&pageType=people'));
        expect(response.status).toBe(200);
        expect(listPeopleOfCity).toHaveBeenCalledWith('chania', { activeRolesOnly: true });
    });
});
