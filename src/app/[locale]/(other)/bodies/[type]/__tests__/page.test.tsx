/** @jest-environment node */
const mockNotFound = jest.fn(() => { throw new Error('notFound'); });
const mockGetBodyDirectoryCached = jest.fn();
const mockGetHotSubjectsCached = jest.fn();
const mockGetUpcomingMeetingsCached = jest.fn();

jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('next-intl/server', () => ({
    getTranslations: async () => (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/cache/queries', () => ({ getBodyDirectoryCached: (...a: unknown[]) => mockGetBodyDirectoryCached(...a) }));
jest.mock('@/lib/db/subject', () => ({ getHotSubjectsCached: (...a: unknown[]) => mockGetHotSubjectsCached(...a) }));
jest.mock('@/lib/db/meetings', () => ({ getUpcomingMeetingsCached: (...a: unknown[]) => mockGetUpcomingMeetingsCached(...a) }));
jest.mock('@/i18n/routing', () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
jest.mock('@/components/signup/CityCard', () => ({ CitySeal: () => null }));
// The pill pulls the dynamic icon set, an ES module Jest cannot load.
jest.mock('@/components/TopicPill', () => ({ TopicPill: ({ label }: { label: string }) => <span>{label}</span> }));
jest.mock('@/lib/utils/hreflang', () => ({ buildCanonicalAlternates: async (path: string) => ({ canonical: `https://opencouncil.gr${path}` }) }));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BodyDirectoryPage, { generateMetadata } from '../page';

const CITY = {
    id: 'chania', name: 'Χανιά', name_en: 'Chania', name_municipality: 'Δήμος Χανίων', name_municipality_en: 'Municipality of Chania',
    logoImage: null, timezone: 'Europe/Athens',
};

function render(type: string) {
    return BodyDirectoryPage({ params: Promise.resolve({ locale: 'el', type }) });
}

/** The page returns the directory element; the directory is an async component, so it is resolved by hand. */
async function renderHtml(type: string) {
    const page = await render(type);
    const directory = page.type as (props: typeof page.props) => Promise<React.ReactElement>;
    return renderToStaticMarkup(await directory(page.props));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetBodyDirectoryCached.mockResolvedValue([{
        id: 'ab_youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', cityId: 'chania', place: null,
        city: CITY, _count: { meetings: 3, roles: 15 }, meetings: [{ id: 'jan10_2026', dateTime: '2026-01-10T16:00:00.000Z' }],
    }]);
    mockGetHotSubjectsCached.mockResolvedValue([{
        id: 's1', name: 'Σκέιτ παρκ στο λιμάνι', description: '', cityId: 'chania', cityName: 'Χανιά', nameMunicipality: 'Δήμος Χανίων',
        logoImage: null, cityTimezone: 'Europe/Athens', councilMeetingId: 'jan10_2026', meetingDate: '2026-01-10T16:00:00.000Z',
        topicName: 'Αθλητισμός', topicColor: '#112233', topicIcon: null, discussionTimeSeconds: 900, speakerCount: 4,
    }]);
    mockGetUpcomingMeetingsCached.mockResolvedValue([{
        id: 'feb14_2026', cityId: 'chania', name: null, name_en: null, kind: 'regular', sessionNumber: 2,
        dateTime: '2026-02-14T16:00:00.000Z', city: { id: 'chania', name: 'Χανιά', name_municipality: 'Δήμος Χανίων', logoImage: null, timezone: 'Europe/Athens' },
        administrativeBody: { id: 'ab_youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' },
    }]);
});

describe('the directory of a body type', () => {
    it('lists the bodies of a secondary type, their hot subjects and their next meetings', async () => {
        const html = await renderHtml('youthCouncil');

        expect(mockGetBodyDirectoryCached).toHaveBeenCalledWith('greece', 'youthCouncil');
        expect(mockGetHotSubjectsCached).toHaveBeenCalledWith('greece', { monthsBack: 12, bodyTypes: ['youthCouncil'] }, 12);
        expect(mockGetUpcomingMeetingsCached).toHaveBeenCalledWith('greece', { limit: 6, bodyTypes: ['youthCouncil'] });
        expect(html).toContain('href="/chania/bodies/ab_youth"');
        expect(html).toContain('Σκέιτ παρκ στο λιμάνι');
        expect(html).toContain('href="/chania/jan10_2026/subjects/s1"');
        expect(html).toContain('href="/chania/feb14_2026"');
        expect(html).toContain('members {&quot;count&quot;:15}');
    });

    it('has no directory for a primary type, nor for a word that is no type', async () => {
        await expect(render('council')).rejects.toThrow('notFound');
        await expect(render('nope')).rejects.toThrow('notFound');
        expect(mockGetBodyDirectoryCached).not.toHaveBeenCalled();
    });

    it('names the page after the type, canonical on the realm apex', async () => {
        const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'el', type: 'youthCouncil' }) });
        expect(metadata.title).toBe('youthCouncil.title | OpenCouncil');
        expect(metadata.alternates).toEqual({ canonical: 'https://opencouncil.gr/bodies/youthCouncil' });
    });
});
