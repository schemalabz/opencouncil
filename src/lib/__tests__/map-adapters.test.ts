import {
    apiSubjectToMapSubject,
    cityToMapMunicipality,
    normalizeIconName,
    subjectWithRelationsToMapSubject,
    type MeetingSubjectLike,
} from '../map/adapters';
import { FALLBACK_TOPIC_COLOR } from '../map/constants';
import type { MapSubjectsApiItem } from '../map/types';

describe('normalizeIconName', () => {
    it('converts PascalCase seed names to kebab-case', () => {
        expect(normalizeIconName('Building2')).toBe('building-2');
        expect(normalizeIconName('Music2')).toBe('music-2');
        expect(normalizeIconName('GraduationCap')).toBe('graduation-cap');
        expect(normalizeIconName('Shield')).toBe('shield');
    });

    it('passes through valid kebab-case names', () => {
        expect(normalizeIconName('building-2')).toBe('building-2');
        expect(normalizeIconName('users')).toBe('users');
    });

    it('returns null for empty names', () => {
        expect(normalizeIconName('')).toBeNull();
        expect(normalizeIconName(null)).toBeNull();
        expect(normalizeIconName(undefined)).toBeNull();
    });

    it('kebab-cases unknown names without validating (renderers validate)', () => {
        expect(normalizeIconName('TotallyNotAnIcon')).toBe('totally-not-an-icon');
    });
});

describe('apiSubjectToMapSubject', () => {
    const baseItem: MapSubjectsApiItem = {
        id: 'subj-1',
        name: 'Ανάπλαση πλατείας',
        description: 'Συζήτηση για την ανάπλαση',
        cityId: 'chania',
        councilMeetingId: 'meeting-1',
        geometry: { type: 'Point', coordinates: [24.0188, 35.5122] },
    };

    it('normalizes swapped [lat, lng] geometry and derives the anchor', () => {
        const subject = apiSubjectToMapSubject({
            ...baseItem,
            geometry: { type: 'Point', coordinates: [35.5122, 24.0188] },
        });
        expect(subject.geometry).toEqual({ type: 'Point', coordinates: [24.0188, 35.5122] });
        expect(subject.anchor).toEqual([24.0188, 35.5122]);
    });

    it('keeps correct geometry unchanged', () => {
        const subject = apiSubjectToMapSubject(baseItem);
        expect(subject.anchor).toEqual([24.0188, 35.5122]);
    });

    it('uses the bbox center as anchor for non-point geometry', () => {
        const subject = apiSubjectToMapSubject({
            ...baseItem,
            geometry: { type: 'LineString', coordinates: [[24.0, 35.5], [24.2, 35.7]] },
        });
        expect(subject.anchor[0]).toBeCloseTo(24.1);
        expect(subject.anchor[1]).toBeCloseTo(35.6);
    });

    it('defaults topic color, normalizes the icon, and nulls missing fields', () => {
        const subject = apiSubjectToMapSubject({ ...baseItem, topicIcon: 'Building2' });
        expect(subject.topicColor).toBe(FALLBACK_TOPIC_COLOR);
        expect(subject.topicIcon).toBe('building-2');
        expect(subject.cityName).toBeNull();
        expect(subject.meetingDate).toBeNull();
        expect(subject.locationText).toBeNull();
    });

    it('derives importance from discussion metrics', () => {
        expect(apiSubjectToMapSubject({ ...baseItem, discussionTimeSeconds: 700, speakerCount: 2 }).importance).toBe('hot');
        expect(apiSubjectToMapSubject({ ...baseItem, discussionTimeSeconds: 30, speakerCount: 1 }).importance).toBe('minor');
        expect(apiSubjectToMapSubject({ ...baseItem, discussionTimeSeconds: 200, speakerCount: 2 }).importance).toBe('normal');
        expect(apiSubjectToMapSubject(baseItem).importance).toBe('minor');
    });
});

describe('subjectWithRelationsToMapSubject', () => {
    const baseSubject: MeetingSubjectLike = {
        id: 'subj-2',
        name: 'Οδός Αίμονος',
        description: 'Πολεοδομικά προβλήματα',
        cityId: 'athens',
        councilMeetingId: 'jan2026',
        topicId: 'urban-planning',
        topic: { id: 'urban-planning', name: 'Πολεοδομία', colorHex: '#9E9E9E', icon: 'Building2' },
        location: { text: 'Οδός Αίμονος', coordinates: { x: 37.99, y: 23.71 } }, // swapped legacy row
    };

    it('returns null without location coordinates', () => {
        expect(subjectWithRelationsToMapSubject({ ...baseSubject, location: null })).toBeNull();
        expect(subjectWithRelationsToMapSubject({ ...baseSubject, location: { text: 'χωρίς συντεταγμένες' } })).toBeNull();
    });

    it('normalizes swapped {x: lat, y: lng} coordinates', () => {
        const subject = subjectWithRelationsToMapSubject(baseSubject);
        expect(subject?.anchor).toEqual([23.71, 37.99]);
        expect(subject?.geometry).toEqual({ type: 'Point', coordinates: [23.71, 37.99] });
    });

    it('keeps correct {x: lng, y: lat} coordinates unchanged', () => {
        const subject = subjectWithRelationsToMapSubject({
            ...baseSubject,
            location: { text: 'σωστή', coordinates: { x: 23.71, y: 37.99 } },
        });
        expect(subject?.anchor).toEqual([23.71, 37.99]);
    });

    it('derives importance and counts from statistics', () => {
        const subject = subjectWithRelationsToMapSubject({
            ...baseSubject,
            statistics: { speakingSeconds: 700.4, people: [{}, {}, {}] },
        });
        expect(subject?.discussionTimeSeconds).toBe(700);
        expect(subject?.speakerCount).toBe(3);
        expect(subject?.importance).toBe('hot');
    });

    it('maps topic fields and meeting context', () => {
        const subject = subjectWithRelationsToMapSubject(baseSubject, {
            cityName: 'Αθήνα',
            meetingDate: new Date('2026-03-23T17:00:00Z'),
            meetingName: 'Συνεδρίαση Μαρτίου',
        });
        expect(subject?.topicIcon).toBe('building-2');
        expect(subject?.topicColor).toBe('#9E9E9E');
        expect(subject?.cityName).toBe('Αθήνα');
        expect(subject?.meetingDate).toBe('2026-03-23T17:00:00.000Z');
        expect(subject?.meetingName).toBe('Συνεδρίαση Μαρτίου');
    });
});

describe('cityToMapMunicipality', () => {
    it('maps city fields and counts', () => {
        const municipality = cityToMapMunicipality(
            {
                id: 'chania',
                name: 'Χανιά',
                name_municipality: 'Δήμος Χανίων',
                logoImage: null,
                officialSupport: true,
                supportsNotifications: true,
                geometry: { type: 'Point', coordinates: [24, 35.5] },
                _count: { councilMeetings: 42 },
            },
            7,
        );
        expect(municipality.meetingsCount).toBe(42);
        expect(municipality.petitionCount).toBe(7);
        expect(municipality.officialSupport).toBe(true);
        expect(municipality.geometry).toEqual({ type: 'Point', coordinates: [24, 35.5] });
    });

    it('defaults missing counts and geometry', () => {
        const municipality = cityToMapMunicipality(
            {
                id: 'sparti',
                name: 'Σπάρτη',
                name_municipality: 'Δήμος Σπάρτης',
                logoImage: null,
                officialSupport: false,
                supportsNotifications: false,
            },
            0,
        );
        expect(municipality.meetingsCount).toBe(0);
        expect(municipality.petitionCount).toBe(0);
        expect(municipality.geometry).toBeNull();
    });
});
