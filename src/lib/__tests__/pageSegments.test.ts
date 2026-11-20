/** @jest-environment node */
import { readdirSync } from 'fs';
import path from 'path';
import { PAGE_SEGMENTS, VALID_CITY_ID, cityIdCandidate } from '../pageSegments';

const localeDir = path.join(__dirname, '../../app/[locale]');

/** The first URL segments under `dir`: a route group adds no segment. */
function firstSegments(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => /^\(.*\)$/.test(entry.name) ? firstSegments(path.join(dir, entry.name)) : [entry.name]);
}

describe('cityIdCandidate', () => {
    it.each(['/', '/en', '/lat', '/about', '/en/about', '/admin/cities', '/lat/search', '/embed/subject'])(
        'is null for %s',
        (pathname) => {
            expect(cityIdCandidate(pathname)).toBeNull();
        },
    );

    it.each([
        ['/athens', 'athens'],
        ['/athens/jun26_2026/subjects/abc', 'athens'],
        ['/en/athens', 'athens'],
        ['/lat/nis/parties/x', 'nis'],
        ['/etc/environment', 'etc'],
        ['/actuator/heapdump', 'actuator'],
        ['/HEAD', 'HEAD'],
        ['/%2eenv', '%2eenv'],
        // Only a whole segment is a locale prefix or a page.
        ['/english', 'english'],
        ['/abouts', 'abouts'],
    ])('names the segment of %s', (pathname, segment) => {
        expect(cityIdCandidate(pathname)).toBe(segment);
    });
});

describe('VALID_CITY_ID', () => {
    it.each(['athens', 'agia-paraskevi', 'nea_smyrni', 'paris15'])('accepts %s', (id) => {
        expect(VALID_CITY_ID.test(id)).toBe(true);
    });

    it.each(['HEAD', '%2eenv', '_profiler', '.env', '15paris', ''])('rejects %s', (id) => {
        expect(VALID_CITY_ID.test(id)).toBe(false);
    });
});

/**
 * The list is written by hand. A page whose directory is not in the list
 * would get a 404 from the proxy.
 */
it('lists the page directories of src/app/[locale] and no other', () => {
    const segments = firstSegments(localeDir).filter(name => !name.startsWith('['));

    expect([...PAGE_SEGMENTS].sort()).toEqual([...new Set(segments)].sort());
});
