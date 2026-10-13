import { spacesObjectFromUrl } from '../spacesUrl';

const app = { bucket: 'townhalls-gr', cdnUrl: 'https://data.opencouncil.gr' };

describe('spacesObjectFromUrl', () => {
    it('reads the bucket from a virtual-host URL, the task server\'s form', () => {
        expect(spacesObjectFromUrl('https://opencouncil-previews.fra1.digitaloceanspaces.com/voiceprints/vrilissia/p1/clip_v1.mp3', app))
            .toEqual({ bucket: 'opencouncil-previews', key: 'voiceprints/vrilissia/p1/clip_v1.mp3' });
    });

    it('reads the bucket from a bucket CDN URL', () => {
        expect(spacesObjectFromUrl('https://townhalls-gr.fra1.cdn.digitaloceanspaces.com/voiceprints/a/b.mp3', app))
            .toEqual({ bucket: 'townhalls-gr', key: 'voiceprints/a/b.mp3' });
    });

    it('reads the bucket from a path-style URL', () => {
        expect(spacesObjectFromUrl('https://fra1.digitaloceanspaces.com/some-bucket/voiceprints/a/b.mp3', app))
            .toEqual({ bucket: 'some-bucket', key: 'voiceprints/a/b.mp3' });
        expect(spacesObjectFromUrl('https://fra1.digitaloceanspaces.com/some-bucket', app)).toBeNull();
    });

    it('maps the app\'s CDN domain to the app\'s bucket', () => {
        expect(spacesObjectFromUrl('https://data.opencouncil.gr/voiceprints/a/b.mp3', app))
            .toEqual({ bucket: 'townhalls-gr', key: 'voiceprints/a/b.mp3' });
        expect(spacesObjectFromUrl('https://townhalls-gr.fra1.cdn.digitaloceanspaces.com/x.mp3', { bucket: 'townhalls-gr', cdnUrl: 'https://townhalls-gr.fra1.cdn.digitaloceanspaces.com' }))
            .toEqual({ bucket: 'townhalls-gr', key: 'x.mp3' });
    });

    it('decodes an escaped key', () => {
        expect(spacesObjectFromUrl('https://b.fra1.digitaloceanspaces.com/voiceprints/%CE%91/clip.mp3', app)?.key).toBe('voiceprints/Α/clip.mp3');
    });

    it('is null for anything that is not a Spaces object', () => {
        expect(spacesObjectFromUrl('https://example.com/audio.mp3', app)).toBeNull();
        expect(spacesObjectFromUrl('https://b.fra1.digitaloceanspaces.com/', app)).toBeNull();
        expect(spacesObjectFromUrl('not a url', app)).toBeNull();
        expect(spacesObjectFromUrl('https://a.b.fra1.digitaloceanspaces.com/k', app)).toBeNull();
    });
});
