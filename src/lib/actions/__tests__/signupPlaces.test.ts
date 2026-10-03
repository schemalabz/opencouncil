/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { GOOGLE_API_KEY: 'test-key' } }));
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'greece' }));
const mockCities = jest.fn();
const mockCityGeometry = jest.fn();
const mockCacheKeys: unknown[][] = [];
jest.mock('@/lib/cache', () => ({
    // A pass-through cache that records its keys: a thrown failure must reach the caller uncached.
    createCache: (fn: () => unknown, keys: unknown[]) => {
        mockCacheKeys.push(keys);
        return fn;
    },
    getAllCitiesMinimalCached: (...args: unknown[]) => mockCities(...args),
    getCityWithGeometryCached: (...args: unknown[]) => mockCityGeometry(...args),
}));
const mockNearPoint = jest.fn();
const mockWithDistances = jest.fn();
jest.mock('@/lib/hotSubjects', () => ({
    getHotSubjectsNearPoint: (...args: unknown[]) => mockNearPoint(...args),
    withDistances: (...args: unknown[]) => mockWithDistances(...args),
}));

import { getNearbySubjects, reverseGeocodePlace } from '../signupPlaces';

const square: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[25.3, 36.3], [25.5, 36.3], [25.5, 36.5], [25.3, 36.5], [25.3, 36.3]]],
};
const city = { id: 'thira', realm: 'greece', geometry: square };

const hot = (id: string, distanceMeters: number | null) => ({
    subject: { id, name: `Θέμα ${id}`, topic: { name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#3b82f6', icon: null } },
    meeting: { dateTime: '2026-09-30T15:00:00.000Z' },
    distanceMeters,
});

const geocodeReply = (body: object) => ({ json: async () => body });
const place = (text: string, lng: number, lat: number) => ({ formatted_address: text, geometry: { location: { lat, lng } } });

const fetchMock = jest.fn();
beforeEach(() => {
    for (const m of [mockCities, mockCityGeometry, mockNearPoint, mockWithDistances, fetchMock]) m.mockReset();
    mockCacheKeys.length = 0;
    mockCities.mockResolvedValue([
        { id: 'thira', supportsNotifications: true },
        { id: 'quiet', supportsNotifications: false },
    ]);
    mockCityGeometry.mockResolvedValue(city);
    global.fetch = fetchMock;
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getNearbySubjects', () => {
    it('keeps only pinned subjects, three at most, and says since when it looked', async () => {
        mockNearPoint.mockResolvedValue({ subjects: [], meetingsScanned: 8, oldestMeetingDate: '2026-06-02T15:00:00.000Z' });
        mockWithDistances.mockResolvedValue([hot('a', 1050), hot('b', null), hot('c', 1442), hot('d', 300), hot('e', 900)]);

        const nearby = await getNearbySubjects({ cityId: 'thira', lng: 25.43, lat: 36.41 });

        expect(mockCities).toHaveBeenCalledWith('greece');
        // The city page's default period, not a fixed count of meetings.
        expect(mockNearPoint).toHaveBeenCalledWith('thira', [25.43, 36.41], 1500, 9, { months: 3 });
        expect(nearby.subjects.map((s) => s.id)).toEqual(['a', 'c', 'd']);
        expect(nearby.subjects[0]).toEqual({
            id: 'a',
            name: 'Θέμα a',
            topic: { name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#3b82f6' },
            meetingDate: '2026-09-30T15:00:00.000Z',
            distanceMeters: 1050,
        });
        expect(nearby.since).toBe('2026-06-02T15:00:00.000Z');
    });

    it('says when the subjects come from before the period, because the period held no meetings', async () => {
        const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const at = (id: string, dateTime: string) => ({ ...hot(id, 500), meeting: { dateTime } });
        mockNearPoint.mockResolvedValue({ subjects: [], meetingsScanned: 8, oldestMeetingDate: daysAgo(400) });

        mockWithDistances.mockResolvedValueOnce([at('old', daysAgo(200)), at('older', daysAgo(400))]);
        expect((await getNearbySubjects({ cityId: 'thira', lng: 25.43, lat: 36.41 })).beyondPeriod).toBe(true);

        mockWithDistances.mockResolvedValueOnce([at('recent', daysAgo(10)), at('older', daysAgo(400))]);
        expect((await getNearbySubjects({ cityId: 'thira', lng: 25.43, lat: 36.41 })).beyondPeriod).toBe(false);
    });

    it('answers nothing for a city outside the realm or without notifications, before any per-city cache', async () => {
        const nothing = { subjects: [], since: null, beyondPeriod: false };
        expect(await getNearbySubjects({ cityId: 'made-up', lng: 25.43, lat: 36.41 })).toEqual(nothing);
        expect(await getNearbySubjects({ cityId: 'quiet', lng: 25.43, lat: 36.41 })).toEqual(nothing);
        expect(mockNearPoint).not.toHaveBeenCalled();
    });

    it('refuses coordinates that are not a point on Earth', async () => {
        await expect(getNearbySubjects({ cityId: 'thira', lng: 250, lat: 36.41 })).rejects.toThrow();
        await expect(getNearbySubjects({ cityId: '', lng: 25.43, lat: 36.41 })).rejects.toThrow();
        expect(mockNearPoint).not.toHaveBeenCalled();
    });
});

describe('reverseGeocodePlace', () => {
    it('refuses an unknown city before it loads a boundary', async () => {
        expect(await reverseGeocodePlace({ cityId: 'made-up', lng: 25.43, lat: 36.41 })).toEqual({ ok: false, reason: 'outside' });
        expect(mockCityGeometry).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a point outside the municipality before asking Google', async () => {
        expect(await reverseGeocodePlace({ cityId: 'thira', lng: 23.72, lat: 37.98 })).toEqual({ ok: false, reason: 'outside' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('snaps the position to the grid and caches by cell', async () => {
        fetchMock.mockResolvedValue(geocodeReply({ status: 'OK', results: [place('Φηρά 847 00, Ελλάδα', 25.4318, 36.4166)] }));

        const result = await reverseGeocodePlace({ cityId: 'thira', lng: 25.431749, lat: 36.416612 });

        expect(result).toEqual({ ok: true, location: { text: 'Φηρά 847 00, Ελλάδα', coordinates: [25.4318, 36.4166] } });
        const url = new URL(fetchMock.mock.calls[0][0] as string);
        expect(url.searchParams.get('latlng')).toBe('36.417,25.432');
        expect(url.searchParams.get('result_type')).toBe('route|neighborhood|sublocality|locality');
        expect(url.searchParams.get('language')).toBe('el');
        expect(mockCacheKeys).toEqual([['signup', 'reverseGeocode', 'thira', 'el', '36.417,25.432']]);
    });

    it('accepts a position inside the boundary even when its grid cell falls outside', async () => {
        const edge: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[[25.3, 36.3], [25.4996, 36.3], [25.4996, 36.5], [25.3, 36.5], [25.3, 36.3]]],
        };
        mockCityGeometry.mockResolvedValue({ ...city, geometry: edge });
        fetchMock.mockResolvedValue(geocodeReply({ status: 'OK', results: [place('Οία, Ελλάδα', 25.48, 36.46)] }));

        const result = await reverseGeocodePlace({ cityId: 'thira', lng: 25.4995, lat: 36.41 });

        expect(result).toEqual({ ok: true, location: { text: 'Οία, Ελλάδα', coordinates: [25.48, 36.46] } });
        expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('latlng')).toBe('36.41,25.5');
    });

    it('skips a street or area whose own coordinate lies outside the municipality', async () => {
        fetchMock.mockResolvedValueOnce(
            geocodeReply({ status: 'OK', results: [place('Outside road', 25.6, 36.4), place('Καρτεράδος, Ελλάδα', 25.44, 36.41)] }),
        );
        expect(await reverseGeocodePlace({ cityId: 'thira', lng: 25.43, lat: 36.41 })).toEqual({
            ok: true,
            location: { text: 'Καρτεράδος, Ελλάδα', coordinates: [25.44, 36.41] },
        });

        fetchMock.mockResolvedValueOnce(geocodeReply({ status: 'OK', results: [place('Outside road', 25.6, 36.4)] }));
        expect(await reverseGeocodePlace({ cityId: 'thira', lng: 25.43, lat: 36.41 })).toEqual({ ok: false, reason: 'not_found' });
    });

    it('tells nothing-there apart from a broken key', async () => {
        fetchMock.mockResolvedValueOnce(geocodeReply({ status: 'ZERO_RESULTS', results: [] }));
        expect(await reverseGeocodePlace({ cityId: 'thira', lng: 25.43, lat: 36.41 })).toEqual({ ok: false, reason: 'not_found' });

        fetchMock.mockResolvedValueOnce(geocodeReply({ status: 'REQUEST_DENIED', error_message: 'expired' }));
        expect(await reverseGeocodePlace({ cityId: 'thira', lng: 25.43, lat: 36.41 })).toEqual({ ok: false, reason: 'unavailable' });
    });
});
