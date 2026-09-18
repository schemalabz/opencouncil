// _registry/index.ts
import type { DocEntry, DocKind } from './types';
import { COMPONENT_ENTRIES } from './components';
import { PATTERN_ENTRIES } from './patterns';

export type { DocEntry, DocKind } from './types';

const REGISTRY: Record<DocKind, DocEntry[]> = {
    components: COMPONENT_ENTRIES,
    patterns: PATTERN_ENTRIES,
};

export const KIND_LABELS: Record<DocKind, string> = {
    components: 'Components',
    patterns: 'Patterns',
};

export function getEntries(kind: DocKind): DocEntry[] {
    return [...REGISTRY[kind]].sort((a, b) => a.name.localeCompare(b.name));
}

export function getEntry(kind: DocKind, slug: string): DocEntry | undefined {
    return REGISTRY[kind].find((e) => e.slug === slug);
}

export interface SidebarSection {
    kind: DocKind;
    label: string;
    items: { slug: string; name: string }[];
}

export function getSidebarSections(): SidebarSection[] {
    return (Object.keys(REGISTRY) as DocKind[]).map((kind) => ({
        kind,
        label: KIND_LABELS[kind],
        items: getEntries(kind).map((e) => ({ slug: e.slug, name: e.name })),
    }));
}
