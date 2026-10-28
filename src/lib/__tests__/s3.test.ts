jest.mock('@/env.mjs', () => ({
    env: {
        DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com',
        DO_SPACES_KEY: 'key',
        DO_SPACES_SECRET: 'secret',
        DO_SPACES_BUCKET: 'bucket',
    },
}));

import { extractFileExtension, objectKey } from '../s3';

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('objectKey', () => {
    it('joins the parts and adds a random part', () => {
        expect(objectKey('uploads', ['chania', 'nov5_2026', 'agenda'], 'pdf')).toMatch(/^uploads\/chania_nov5_2026_agenda_[0-9a-f]{8}\.pdf$/);
    });

    it('names the file with a v4 UUID when there are no parts, and lowers the extension', () => {
        expect(objectKey('party-logos', [], 'PNG')).toMatch(new RegExp(`^party-logos/${UUID_V4}\\.png$`));
    });

    it('keeps a free-text part from moving the file to another folder', () => {
        expect(objectKey('uploads', ['chania', '../other/city', 'agenda'], 'pdf')).toMatch(/^uploads\/chania_-other-city_agenda_[0-9a-f]{8}\.pdf$/);
    });

    it('gives a different key on each call', () => {
        const keys = new Set(Array.from({ length: 50 }, () => objectKey('uploads', ['chania', 'agenda'], 'pdf')));
        expect(keys.size).toBe(50);
    });
});

describe('extractFileExtension', () => {
    it('falls back to bin when the name ends with a dot', () => {
        expect(extractFileExtension('file.')).toBe('bin');
    });
});
