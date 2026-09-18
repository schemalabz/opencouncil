// page.tsx
import type { Metadata } from 'next';
import { AuditTable } from './AuditTable';
import { ElementsExplorer, type ExplorerItem } from './ElementsExplorer';
import { getEntries, type DocKind } from './_registry';
import { BRANDING, PALETTE, TYPOGRAPHY, type FoundationItem } from './_registry/foundations';

export const metadata: Metadata = {
    title: 'Design System · OpenCouncil',
    description: 'OpenCouncil foundations, components, and LLM design context.',
};

function foundationItems(group: ExplorerItem['group'], items: FoundationItem[]): ExplorerItem[] {
    return items.map((i) => ({ group, id: i.id, name: i.name, preview: i.preview, code: i.code, design: i.design }));
}

function elementItems(kind: DocKind): ExplorerItem[] {
    return getEntries(kind).map((e) => ({
        group: kind,
        id: e.slug,
        name: e.name,
        preview: e.sample,
        code: [e.imports, e.code].filter(Boolean).join('\n\n'),
        design: e.design ?? '',
        href: `/docs/design-system/${kind}/${e.slug}`,
    }));
}

export default function DesignSystemOverview() {
    const items: ExplorerItem[] = [
        ...foundationItems('branding', BRANDING),
        ...foundationItems('palette', PALETTE),
        ...foundationItems('typography', TYPOGRAPHY),
        ...elementItems('components'),
        ...elementItems('patterns'),
    ];

    return (
        <div className="space-y-12">
            <section className="space-y-3">
                <h2 className="text-2xl font-bold">Introduction</h2>
                <p className="text-muted-foreground max-w-2xl">
                    OpenCouncil’s living design system — branding, palette, typography, and live components.
                    Square, plain, exact controls; Civic Flame and the one brand gradient reserved for primary
                    actions. Toggle “Select and generate prompt” to compose a Design or Code prompt from any
                    elements, or use “Design with LLM” for the full rules.
                </p>
            </section>

            <ElementsExplorer items={items} />

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Cross-folder audit</h2>
                <p className="text-sm text-muted-foreground">
                    Main <code>src/components/ui</code> vs the sibling <code>opencouncil-design</code> app.
                    See <code>docs/design-system-audit.md</code>.
                </p>
                <AuditTable />
            </section>
        </div>
    );
}
