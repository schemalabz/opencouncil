import { filterSubjectsInBounds, type ViewportBounds } from '../map/viewport';
import type { MapSubject } from '../map/types';

function subjectAt(id: string, lng: number, lat: number): MapSubject {
    return {
        id,
        name: id,
        description: null,
        cityId: 'city',
        cityName: null,
        councilMeetingId: 'meeting',
        meetingDate: null,
        meetingName: null,
        locationText: null,
        topicId: null,
        topicName: null,
        topicColor: '#627BBC',
        topicIcon: null,
        discussionTimeSeconds: 0,
        speakerCount: 0,
        importance: 'minor',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        anchor: [lng, lat],
    };
}

describe('filterSubjectsInBounds', () => {
    const bounds: ViewportBounds = { west: 23, south: 37, east: 24, north: 38 };

    it('keeps subjects inside the viewport', () => {
        const inside = subjectAt('inside', 23.5, 37.5);
        const west = subjectAt('west', 22.9, 37.5);
        const north = subjectAt('north', 23.5, 38.1);
        expect(filterSubjectsInBounds([inside, west, north], bounds)).toEqual([inside]);
    });

    it('includes subjects exactly on the edges', () => {
        const onEdge = subjectAt('edge', 23, 38);
        expect(filterSubjectsInBounds([onEdge], bounds)).toEqual([onEdge]);
    });

    it('returns an empty list when nothing is visible', () => {
        expect(filterSubjectsInBounds([subjectAt('away', 0, 0)], bounds)).toEqual([]);
    });
});
