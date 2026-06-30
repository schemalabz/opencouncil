/** @jest-environment node */
import { parseChannelRef, isValidYouTubeUrl } from '../youtube';

describe('parseChannelRef', () => {
    it('extracts a canonical channel id from /channel/UC… URLs', () => {
        expect(parseChannelRef('https://www.youtube.com/channel/UCX5CxaBSCrAJxQawnE1sKHw')).toEqual({
            kind: 'id',
            value: 'UCX5CxaBSCrAJxQawnE1sKHw',
        });
    });

    it('extracts a handle from /@handle URLs', () => {
        expect(parseChannelRef('https://www.youtube.com/@cityofathens.youtube')).toEqual({
            kind: 'handle',
            value: 'cityofathens.youtube',
        });
    });

    it('extracts a handle from /@handle URLs with trailing path/query', () => {
        expect(parseChannelRef('https://www.youtube.com/@cityofathens.youtube/streams?foo=bar')).toEqual({
            kind: 'handle',
            value: 'cityofathens.youtube',
        });
    });

    it('extracts a legacy username from /user/ URLs', () => {
        expect(parseChannelRef('https://www.youtube.com/user/cityofathens')).toEqual({
            kind: 'user',
            value: 'cityofathens',
        });
    });

    it('extracts a vanity name from /c/ URLs', () => {
        expect(parseChannelRef('https://www.youtube.com/c/CityOfAthens')).toEqual({
            kind: 'custom',
            value: 'CityOfAthens',
        });
    });

    it('treats a bare handle (with @) as a handle', () => {
        expect(parseChannelRef('@cityofathens')).toEqual({ kind: 'handle', value: 'cityofathens' });
    });

    it('treats a bare name (no @, no slash) as a handle', () => {
        expect(parseChannelRef('cityofathens')).toEqual({ kind: 'handle', value: 'cityofathens' });
    });

    it('handles m. and missing-www hosts', () => {
        expect(parseChannelRef('https://m.youtube.com/@foo')).toEqual({ kind: 'handle', value: 'foo' });
        expect(parseChannelRef('https://youtube.com/channel/UCabc')).toEqual({ kind: 'id', value: 'UCabc' });
    });

    it('returns null for empty or unrecognized input', () => {
        expect(parseChannelRef('')).toBeNull();
        expect(parseChannelRef('https://www.youtube.com/watch?v=abc')).toBeNull();
        expect(parseChannelRef('not a url /')).toBeNull();
    });
});

describe('isValidYouTubeUrl', () => {
    it('accepts watch, live, shorts, and youtu.be URLs', () => {
        expect(isValidYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
        expect(isValidYouTubeUrl('https://www.youtube.com/live/abc123')).toBe(true);
        expect(isValidYouTubeUrl('https://youtu.be/abc123')).toBe(true);
    });

    it('rejects channel URLs and non-YouTube URLs', () => {
        expect(isValidYouTubeUrl('https://www.youtube.com/@foo')).toBe(false);
        expect(isValidYouTubeUrl('https://example.com/watch?v=abc')).toBe(false);
    });
});
