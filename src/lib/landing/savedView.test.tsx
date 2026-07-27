import { readSavedView, writeSavedView } from './savedView';

const KEY = 'oc:landing:view';
const CHANIA: [number, number] = [24.02921, 35.51124];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Write a raw entry as it would look after `at` ms ago, bypassing writeSavedView's clamping. */
const seed = (value: unknown) => window.localStorage.setItem(KEY, JSON.stringify(value));

beforeEach(() => window.localStorage.clear());

describe('savedView round-trip', () => {
    it('restores a view that was just saved', () => {
        writeSavedView({ center: CHANIA, zoom: 12 });
        expect(readSavedView()).toEqual({ center: CHANIA, zoom: 12 });
    });

    it('returns null when nothing was ever saved', () => {
        expect(readSavedView()).toBeNull();
    });
});

describe('zoom clamping', () => {
    it('caps a street-level zoom at 14', () => {
        writeSavedView({ center: CHANIA, zoom: 18.5 });
        expect(readSavedView()?.zoom).toBe(14);
    });

    it('leaves a zoom at the cap untouched', () => {
        writeSavedView({ center: CHANIA, zoom: 14 });
        expect(readSavedView()?.zoom).toBe(14);
    });

    it('floors a negative zoom at 0 so it survives the next read', () => {
        writeSavedView({ center: CHANIA, zoom: -3 });
        expect(readSavedView()?.zoom).toBe(0);
    });

    it('leaves a zoom below the cap untouched', () => {
        writeSavedView({ center: CHANIA, zoom: 9.3 });
        expect(readSavedView()?.zoom).toBe(9.3);
    });
});

describe('staleness', () => {
    it('keeps a view saved just inside the 30-day window', () => {
        seed({ center: CHANIA, zoom: 12, at: Date.now() - 29 * DAY_MS });
        expect(readSavedView()).toEqual({ center: CHANIA, zoom: 12 });
    });

    it('discards a view older than 30 days', () => {
        seed({ center: CHANIA, zoom: 12, at: Date.now() - 31 * DAY_MS });
        expect(readSavedView()).toBeNull();
    });
});

describe('rejecting junk', () => {
    it.each([
        ['malformed JSON', '{not json'],
        ['a non-object', '42'],
        ['null', 'null'],
    ])('returns null for %s', (_label, raw) => {
        window.localStorage.setItem(KEY, raw);
        expect(readSavedView()).toBeNull();
    });

    it.each([
        ['a missing timestamp', { center: CHANIA, zoom: 12 }],
        ['a non-numeric timestamp', { center: CHANIA, zoom: 12, at: 'yesterday' }],
        ['a missing zoom', { center: CHANIA, at: Date.now() }],
        ['an out-of-range zoom', { center: CHANIA, zoom: 99, at: Date.now() }],
        ['a missing center', { zoom: 12, at: Date.now() }],
        ['a one-element center', { center: [24.02921], zoom: 12, at: Date.now() }],
        ['a non-numeric center', { center: ['a', 'b'], zoom: 12, at: Date.now() }],
        ['an out-of-range latitude', { center: [24.02921, 999], zoom: 12, at: Date.now() }],
    ])('returns null for %s', (_label, value) => {
        seed(value);
        expect(readSavedView()).toBeNull();
    });
});
