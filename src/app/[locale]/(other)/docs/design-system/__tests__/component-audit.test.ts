import { COMPONENT_AUDIT, AUDIT_CATEGORIES } from '../component-audit';

describe('component-audit', () => {
    it('every row has a known category', () => {
        for (const row of COMPONENT_AUDIT) {
            expect(AUDIT_CATEGORIES).toContain(row.category);
        }
    });

    it('has no duplicate names', () => {
        const names = COMPONENT_AUDIT.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('common rows are in both, sibling-only only in sibling, main-only only in main', () => {
        for (const row of COMPONENT_AUDIT) {
            if (row.category === 'common') expect(row.inMain && row.inSibling).toBe(true);
            if (row.category === 'sibling-only') expect(row.inMain).toBe(false);
            if (row.category === 'main-only') expect(row.inSibling).toBe(false);
        }
    });
});
