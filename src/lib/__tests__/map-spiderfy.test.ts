import { anchorKeyOf, spiderfyExtent, spiderfyPositions } from '../map/spiderfy';
import { SPIDERFY_CIRCLE_MAX } from '../map/constants';

describe('anchorKeyOf', () => {
    it('matches repeated geocodes of the same address', () => {
        expect(anchorKeyOf([23.7275001, 37.9838])).toBe(anchorKeyOf([23.7275, 37.9838]));
    });

    it('distinguishes genuinely different points', () => {
        expect(anchorKeyOf([23.7275, 37.9838])).not.toBe(anchorKeyOf([23.7290, 37.9838]));
    });
});

describe('spiderfyPositions', () => {
    it('returns an empty list for zero', () => {
        expect(spiderfyPositions(0)).toEqual([]);
    });

    it('lays small groups on a ring at equal distance from the anchor', () => {
        const positions = spiderfyPositions(5);
        expect(positions).toHaveLength(5);
        const radii = positions.map(p => Math.hypot(p.x, p.y));
        for (const radius of radii) {
            expect(radius).toBeCloseTo(radii[0], 6);
        }
    });

    it('keeps ring neighbors apart by at least a badge width', () => {
        const positions = spiderfyPositions(SPIDERFY_CIRCLE_MAX);
        for (let i = 0; i < positions.length; i++) {
            const next = positions[(i + 1) % positions.length];
            const gap = Math.hypot(positions[i].x - next.x, positions[i].y - next.y);
            expect(gap).toBeGreaterThanOrEqual(34);
        }
    });

    it('spirals outward for larger groups without collisions', () => {
        const positions = spiderfyPositions(20);
        expect(positions).toHaveLength(20);
        // every pair at least ~a badge apart
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const gap = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
                expect(gap).toBeGreaterThanOrEqual(30);
            }
        }
    });
});

describe('spiderfyExtent', () => {
    it('covers the farthest offset', () => {
        const positions = spiderfyPositions(12);
        const extent = spiderfyExtent(positions);
        for (const position of positions) {
            expect(Math.abs(position.x)).toBeLessThanOrEqual(extent);
            expect(Math.abs(position.y)).toBeLessThanOrEqual(extent);
        }
    });
});
