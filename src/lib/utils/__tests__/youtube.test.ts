/** @jest-environment node */
import { parseChannelRef, isValidYouTubeUrl, parseVideoId, parseYouTubeLink } from '../youtube';

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

    it('rejects /c/ vanity URLs', () => {
        expect(parseChannelRef('https://www.youtube.com/c/CityOfAthens')).toBeNull();
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

    it('rejects channel-like paths on non-YouTube hosts', () => {
        expect(parseChannelRef('https://example.com/@otherchannel')).toBeNull();
        expect(parseChannelRef('https://evil.com/channel/UCabc')).toBeNull();
        expect(parseChannelRef('https://notyoutube.com/user/foo')).toBeNull();
        // Substring/look-alike hosts must not pass the suffix check.
        expect(parseChannelRef('https://youtube.com.evil.com/@foo')).toBeNull();
        expect(parseChannelRef('https://fakeyoutube.com/@foo')).toBeNull();
    });

    it('accepts youtube-nocookie.com and music.youtube.com hosts', () => {
        expect(parseChannelRef('https://www.youtube-nocookie.com/channel/UCabc')).toEqual({ kind: 'id', value: 'UCabc' });
        expect(parseChannelRef('https://music.youtube.com/channel/UCabc')).toEqual({ kind: 'id', value: 'UCabc' });
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

const ID = 'dQw4w9WgXcQ';

describe('parseVideoId', () => {
    it.each([
        [`https://www.youtube.com/watch?v=${ID}`],
        [`https://www.youtube.com/watch?v=${ID}&t=90`],
        [`https://m.youtube.com/watch?v=${ID}`],
        [`https://youtu.be/${ID}?si=abc`],
        [`https://youtu.be/${ID}/`],
        [`https://www.youtube.com/live/${ID}`],
        [`https://www.youtube.com/shorts/${ID}`],
        [` \thttps://www.youtube.com/watch?v=${ID}\n `],
    ])('extracts the id from %j', (url) => {
        expect(parseVideoId(url)).toBe(ID);
    });

    it.each([
        [null],
        [''],
        ['https://example.com/watch?v=dQw4w9WgXcQ'],
        ['https://townhalls-gr.fra1.digitaloceanspaces.com/uploads/x_recording.mp4'],
    ])('returns null for %j', (url) => {
        expect(parseVideoId(url)).toBeNull();
    });

    it('ignores an id that only appears inside another parameter', () => {
        expect(parseVideoId(`https://www.youtube.com/watch?v=OTHERvideo1&list=PLxxv=${ID}`)).toBe('OTHERvideo1');
    });
});

describe('parseYouTubeLink', () => {
    it.each([
        ['as typed', `https://www.youtube.com/watch?v=${ID}&t=90`],
        ['after the router collapsed "//"', `https:/www.youtube.com/watch?v=${ID}&t=90`],
        ['without a scheme', `www.youtube.com/watch?v=${ID}&t=90`],
        ['with an upper-case scheme', `HTTPS://www.youtube.com/watch?v=${ID}&t=90`],
    ])('accepts a link %s', (_, raw) => {
        expect(parseYouTubeLink(raw)).toEqual({ videoId: ID, startSeconds: 90 });
    });

    it.each([
        ['90', 90],
        ['90s', 90],
        ['0', 0],
        ['1m', 60],
        ['2m3s', 123],
        ['1h2m3s', 3723],
        ['86400', 86400],
    ])('reads t=%s as %d seconds', (t, seconds) => {
        expect(parseYouTubeLink(`https://youtu.be/${ID}?t=${t}`)?.startSeconds).toBe(seconds);
    });

    it('reads the start parameter, also when t is empty', () => {
        expect(parseYouTubeLink(`youtu.be/${ID}?start=45`)?.startSeconds).toBe(45);
        expect(parseYouTubeLink(`youtu.be/${ID}?t=&start=45`)?.startSeconds).toBe(45);
    });

    it.each([[''], ['garbage'], ['86401'], ['25h'], ['99999999999']])('has no start second for t=%j', (t) => {
        expect(parseYouTubeLink(`https://youtu.be/${ID}?t=${t}`)).toEqual({ videoId: ID, startSeconds: null });
    });

    it.each([
        ['a non-YouTube link', 'https://vimeo.com/12345'],
        ['a channel link', 'https://www.youtube.com/@city'],
        ['an id that is not 11 characters', 'https://www.youtube.com/watch?v=abc123'],
        ['an id with extra characters', `https://youtu.be/${ID}extra`],
        ['an empty string', ''],
    ])('returns null for %s', (_, raw) => {
        expect(parseYouTubeLink(raw)).toBeNull();
    });
});
