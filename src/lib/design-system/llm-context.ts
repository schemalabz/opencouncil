// src/lib/design-system/llm-context.ts
import fs from 'fs';
import path from 'path';
import { PREAMBLE, SKILL } from './content';

export const DESIGN_CONTEXT_DOCS = ['design', 'product', 'preamble', 'combined', 'skill'] as const;
export type DesignContextDoc = (typeof DESIGN_CONTEXT_DOCS)[number];

export function isDesignContextDoc(value: string): value is DesignContextDoc {
    return (DESIGN_CONTEXT_DOCS as readonly string[]).includes(value);
}

function readRootDoc(filename: string): string {
    return fs.readFileSync(path.join(process.cwd(), filename), 'utf8');
}

export function getDesignContext(doc: DesignContextDoc): string {
    switch (doc) {
        case 'design':
            return readRootDoc('DESIGN.md');
        case 'product':
            return readRootDoc('PRODUCT.md');
        case 'preamble':
            return PREAMBLE;
        case 'skill':
            return SKILL;
        case 'combined':
            return [PREAMBLE, readRootDoc('DESIGN.md'), readRootDoc('PRODUCT.md')].join('\n\n---\n\n');
    }
}
