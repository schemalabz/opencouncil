import { parseManifest, type Manifest } from './manifest';

const file = { name: 'subset.tar.zst', sha256: 'a'.repeat(64), bytes: 1 };
const manifest: Manifest = {
    producedAt: '2026-10-23T00:00:00.000Z',
    backup: { path: 'production.sql.gz', date: '2026-10-23T01:00:00.000Z' },
    migrationHead: null,
    greenmaskVersion: 'test',
    meetingsPerBody: 2,
    cities: [],
    meetings: [],
    counts: {},
    files: { subset: file, full: { ...file, name: 'full.tar.zst' } },
};
const withSubset = (subset: object) => JSON.stringify({ ...manifest, files: { ...manifest.files, subset: { ...file, ...subset } } });

// fetch puts both fields into paths in the download cache.
describe('parseManifest', () => {
    test('accepts a file name and a sha256', () => {
        expect(parseManifest(JSON.stringify(manifest), 'test').files.subset).toEqual(file);
    });

    test.each([['../../escaped.txt'], ['dir/subset.tar.zst'], ['..'], ['.']])('refuses the name %s', (name) => {
        expect(() => parseManifest(withSubset({ name }), 'test')).toThrow(/files\.subset\.name: must be a file name/);
    });

    test.each([['../../out'], ['A'.repeat(64)], ['a'.repeat(63)]])('refuses the sha256 %s', (sha256) => {
        expect(() => parseManifest(withSubset({ sha256 }), 'test')).toThrow(/files\.subset\.sha256: must be 64 lowercase hex/);
    });
});
