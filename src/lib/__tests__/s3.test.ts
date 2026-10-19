jest.mock('@/env.mjs', () => ({
    env: {
        DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
        DO_SPACES_KEY: 'key',
        DO_SPACES_SECRET: 'secret',
        DO_SPACES_BUCKET: 'bucket',
    },
}));

import { extractFileExtension, generateRandomFilename } from '../s3';

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('generateRandomFilename', () => {
    it('names the file with a v4 UUID and keeps the extension', () => {
        expect(generateRandomFilename('Logo Final.PNG')).toMatch(new RegExp(`^${UUID_V4}\\.PNG$`));
    });

    it('uses the last extension of a name with several dots', () => {
        expect(generateRandomFilename('agenda.v2.pdf')).toMatch(new RegExp(`^${UUID_V4}\\.pdf$`));
    });

    it('gives a different name on each call', () => {
        const names = new Set(Array.from({ length: 50 }, () => generateRandomFilename('a.jpg')));
        expect(names.size).toBe(50);
    });
});

describe('extractFileExtension', () => {
    it('falls back to bin when the name ends with a dot', () => {
        expect(extractFileExtension('file.')).toBe('bin');
    });
});
