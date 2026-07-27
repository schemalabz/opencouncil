import { computeMunicipalityDonutSegments, municipalityDonutSvg } from './donut';
import type { LandingSubject } from './landingData';

// Minimal LandingSubject — only the fields the segment builders read.
const subject = (topicId: string | null, color = '#111111', icon: string | null = null): LandingSubject =>
    ({ topicId, topic: { name: topicId ?? 'Γενικά', color, icon } }) as unknown as LandingSubject;

const many = (n: number, topicId: string | null, color?: string) =>
    Array.from({ length: n }, () => subject(topicId, color));

describe('computeMunicipalityDonutSegments', () => {
    it('gives every topic its own segment, however long the tail', () => {
        // 13 topics is what the real δήμοι carry
        const members = Array.from({ length: 13 }, (_, i) => many(13 - i, `t${i}`, `#${i}${i}${i}${i}${i}${i}`)).flat();
        const segments = computeMunicipalityDonutSegments(members);
        expect(segments).toHaveLength(13);
        expect(segments.some((s) => s.topicId === 'other')).toBe(false);
    });

    it('orders segments by count, largest first', () => {
        const segments = computeMunicipalityDonutSegments([...many(2, 'b'), ...many(9, 'a'), ...many(5, 'c')]);
        expect(segments.map((s) => [s.topicId, s.count])).toEqual([
            ['a', 9],
            ['c', 5],
            ['b', 2],
        ]);
    });

    it('leaves untopiced subjects out of the ring rather than greying them in', () => {
        const segments = computeMunicipalityDonutSegments([...many(3, 'a'), ...many(7, null)]);
        expect(segments).toEqual([expect.objectContaining({ topicId: 'a', count: 3 })]);
    });

    it('returns nothing when no subject has a topic, so the caller can draw its neutral fallback', () => {
        expect(computeMunicipalityDonutSegments(many(4, null))).toEqual([]);
    });

    it('carries each topic\'s own colour and icon through', () => {
        const [segment] = computeMunicipalityDonutSegments([subject('a', '#4f46e5', 'leaf')]);
        expect(segment).toMatchObject({ color: '#4f46e5', icon: 'leaf' });
    });

    it('is deterministic when counts tie', () => {
        const members = [...many(3, 'b'), ...many(3, 'a')];
        expect(computeMunicipalityDonutSegments(members).map((s) => s.topicId)).toEqual(['a', 'b']);
    });

    it('handles no members', () => {
        expect(computeMunicipalityDonutSegments([])).toEqual([]);
    });

});

describe('municipalityDonutSvg', () => {
    const segments = computeMunicipalityDonutSegments([...many(3, 'a', '#a11'), ...many(2, 'b', '#1a1')]);

    // The bug this guards: the production minifier once dropped the `xmlns`/`style` chunk when the
    // opening tag was split across `+`, folding `<g …>` into the viewBox attribute and offsetting
    // every arc. Assert the tag stays a single well-formed piece.
    it('emits one well-formed <svg> open tag with the <g> intact, not swallowed into viewBox', () => {
        const svg = municipalityDonutSvg(segments);
        expect(svg).toMatch(
            /^<svg width="\d+" height="\d+" viewBox="0 0 \d+ \d+" xmlns="http:\/\/www\.w3\.org\/2000\/svg" style="display:block"><g transform="translate\([\d.]+,[\d.]+\)">/,
        );
        expect(svg).toContain('</g></svg>');
        // exactly one root svg, one group — a corrupted/duplicated tag would trip these
        expect(svg.match(/<svg\b/g)).toHaveLength(1);
        expect(svg.match(/<g\b/g)).toHaveLength(1);
    });

    it('draws one arc path per topic segment', () => {
        expect(municipalityDonutSvg(segments).match(/<path\b/g)).toHaveLength(2);
    });

    it('still draws a ring (fallback segment) when there are no topic segments', () => {
        const svg = municipalityDonutSvg([]);
        expect(svg).toMatch(/^<svg\b/);
        expect(svg.match(/<path\b/g)).toHaveLength(1);
    });
});
