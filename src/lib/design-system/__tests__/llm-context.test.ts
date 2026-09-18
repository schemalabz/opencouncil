// src/lib/design-system/__tests__/llm-context.test.ts
import {
    DESIGN_CONTEXT_DOCS,
    getDesignContext,
    isDesignContextDoc,
} from '@/lib/design-system/llm-context';

describe('llm-context', () => {
    it('lists the five supported docs', () => {
        expect(DESIGN_CONTEXT_DOCS).toEqual(['design', 'product', 'preamble', 'combined', 'skill']);
    });

    it('validates doc keys', () => {
        expect(isDesignContextDoc('design')).toBe(true);
        expect(isDesignContextDoc('nope')).toBe(false);
    });

    it('reads DESIGN.md for "design"', () => {
        expect(getDesignContext('design')).toContain('Civic Flame');
    });

    it('reads PRODUCT.md for "product"', () => {
        expect(getDesignContext('product').length).toBeGreaterThan(100);
    });

    it('combined contains preamble + design + product', () => {
        const combined = getDesignContext('combined');
        expect(combined).toContain('Designing for OpenCouncil'); // preamble
        expect(combined).toContain('Civic Flame'); // design
        expect(combined.split('---').length).toBeGreaterThanOrEqual(3);
    });

    it('skill returns the skill front-matter', () => {
        expect(getDesignContext('skill')).toContain('name: opencouncil-design');
    });
});
