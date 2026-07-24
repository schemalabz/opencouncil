import { aggregateMunicipalityCounts } from './landingData';
import type { LandingSubject, LandingGeneralCity, LandingMapCity } from './landingData';

// Minimal LandingSubject — only the fields the aggregate reads.
const subject = (
    cityId: string,
    nameMunicipality: string,
    lng: number,
    lat: number,
    cityLogo: string | null = null,
): LandingSubject => ({ cityId, cityName: cityId, nameMunicipality, cityLogo, lng, lat } as unknown as LandingSubject);

const general = (cityId: string, nameMunicipality: string, lng: number, lat: number, n: number): LandingGeneralCity => ({
    cityId,
    cityName: cityId,
    nameMunicipality,
    lng,
    lat,
    subjects: Array.from({ length: n }, () => subject(cityId, nameMunicipality, lng, lat)),
});

const mapCity = (
    id: string,
    lng: number,
    lat: number,
    geometry: GeoJSON.Geometry | null = null,
    logoImage: string | null = null,
): LandingMapCity => ({ id, name: id, nameMunicipality: id, logoImage, lng, lat, geometry } as LandingMapCity);

const GEOM: GeoJSON.Geometry = { type: 'Point', coordinates: [1, 2] };

describe('aggregateMunicipalityCounts', () => {
    it('sums located + non-located subjects per δήμος', () => {
        const result = aggregateMunicipalityCounts(
            [subject('chania', 'Δήμος Χανίων', 24, 35.5), subject('chania', 'Δήμος Χανίων', 24.1, 35.5)],
            [general('chania', 'Δήμος Χανίων', 24.02, 35.51, 3)],
            [mapCity('chania', 24.02, 35.51)],
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ cityId: 'chania', count: 5 });
    });

    it("carries every counted subject in `members`, so the marker's donut can segment them by topic", () => {
        const located = [subject('chania', 'Δήμος Χανίων', 24, 35.5), subject('chania', 'Δήμος Χανίων', 24.1, 35.5)];
        const nonLocated = general('chania', 'Δήμος Χανίων', 24.02, 35.51, 3);
        const result = aggregateMunicipalityCounts(located, [nonLocated], [mapCity('chania', 24.02, 35.51)]);

        // located + non-located alike, and never out of step with the count the donut prints
        expect(result[0].members).toHaveLength(result[0].count);
        expect(result[0].members).toEqual(expect.arrayContaining([...located, ...nonLocated.subjects]));
    });

    it('does not mutate the caller\'s subject arrays while accumulating', () => {
        const nonLocated = general('samos', 'Δήμος Σάμου', 26.9, 37.7, 2);
        aggregateMunicipalityCounts([subject('samos', 'Δήμος Σάμου', 26.9, 37.7)], [nonLocated], []);
        expect(nonLocated.subjects).toHaveLength(2);
    });

    it('keeps δήμοι separate', () => {
        const result = aggregateMunicipalityCounts(
            [subject('chania', 'Δήμος Χανίων', 24, 35.5), subject('athens', 'Δήμος Αθηναίων', 23.7, 38)],
            [],
            [mapCity('chania', 24.02, 35.51), mapCity('athens', 23.72, 37.98)],
        );
        expect(result.map((r) => [r.cityId, r.count]).sort()).toEqual([
            ['athens', 1],
            ['chania', 1],
        ]);
    });

    it('places the bubble at the δήμος centroid, not the subjects', () => {
        // Subject far from the mapCities centroid — the centroid must win.
        const result = aggregateMunicipalityCounts(
            [subject('chania', 'Δήμος Χανίων', 99, 88)],
            [],
            [mapCity('chania', 24.02, 35.51, GEOM)],
        );
        expect(result[0]).toMatchObject({ lng: 24.02, lat: 35.51, geometry: GEOM });
    });

    it('falls back to the mean of its own points when the δήμος is not in mapCities', () => {
        const result = aggregateMunicipalityCounts(
            [subject('x', 'Δήμος X', 10, 20), subject('x', 'Δήμος X', 20, 40)],
            [],
            [],
        );
        expect(result[0]).toMatchObject({ lng: 15, lat: 30, geometry: null });
    });

    it('is empty when there are no subjects', () => {
        expect(aggregateMunicipalityCounts([], [], [mapCity('chania', 24, 35)])).toEqual([]);
    });

    it('counts a δήμος with only non-located subjects', () => {
        const result = aggregateMunicipalityCounts([], [general('samos', 'Δήμος Σάμου', 26.9, 37.7, 4)], []);
        expect(result[0]).toMatchObject({ cityId: 'samos', count: 4 });
    });

    it("prefers mapCities' logo over a subject's", () => {
        const result = aggregateMunicipalityCounts(
            [subject('chania', 'Δήμος Χανίων', 24, 35.5, 'subject-logo.png')],
            [],
            [mapCity('chania', 24.02, 35.51, GEOM, 'map-logo.png')],
        );
        expect(result[0].logoImage).toBe('map-logo.png');
    });

    it("falls back to a subject's logo when the δήμος is not in mapCities", () => {
        const result = aggregateMunicipalityCounts([subject('x', 'Δήμος X', 10, 20, 'subject-logo.png')], [], []);
        expect(result[0].logoImage).toBe('subject-logo.png');
    });
});
