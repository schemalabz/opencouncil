/** @jest-environment node */
import { readdirSync } from 'fs';
import path from 'path';
import { PAGE_SEGMENTS, cityIdCandidate } from '../pageSegments';

const localeDir = path.join(__dirname, '../../app/[locale]');

/** The first URL segments under `dir`: a route group adds no segment. */
function firstSegments(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => /^\(.*\)$/.test(entry.name) ? firstSegments(path.join(dir, entry.name)) : [entry.name]);
}

describe('cityIdCandidate', () => {
    it.each(['/', '/en', '/lat', '/EN', '/about', '/en/about', '/EN/about', '/admin/cities', '/lat/search', '/embed/subject', '/%61bout'])(
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
        ['/EN/athens', 'athens'],
        ['/LAT/nis', 'nis'],
        ['/HEAD', 'HEAD'],
        // Next decodes the path before it matches a route.
        ['/%2eenv', '.env'],
        ['/%61thens', 'athens'],
        ['/papagos%2Dcholargos', 'papagos-cholargos'],
        // A bad escape stays as it is, and is not a city.
        ['/%E0%A4%A', '%E0%A4%A'],
        // Only a whole segment is a locale prefix or a page.
        ['/english', 'english'],
        ['/abouts', 'abouts'],
    ])('names the segment of %s', (pathname, segment) => {
        expect(cityIdCandidate(pathname)).toBe(segment);
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
