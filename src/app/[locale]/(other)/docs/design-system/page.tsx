// page.tsx
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { AuditTable } from './AuditTable';
import { getEntries } from './_registry';

export const metadata: Metadata = {
    title: 'Design System · OpenCouncil',
    description: 'OpenCouncil component showcase, cross-folder audit, and LLM design context.',
};

export default function DesignSystemOverview() {
    const counts = { components: getEntries('components').length, patterns: getEntries('patterns').length };
    return (
        <div className="space-y-12">
            <section className="space-y-3">
                <h2 className="text-2xl font-bold">Introduction</h2>
                <p className="text-muted-foreground max-w-2xl">
                    Live OpenCouncil components, documented with usage guidance. Square, plain, exact controls —
                    Civic Flame and the one brand gradient reserved for primary actions. Use “Design with LLM” to copy
                    the design + product rules into any model.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
                    <Link href="/docs/design-system/components" className="rounded-md border p-4 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold">Components →</div>
                        <div className="text-sm text-muted-foreground">{counts.components} primitives</div>
                    </Link>
                    <Link href="/docs/design-system/patterns" className="rounded-md border p-4 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold">Patterns →</div>
                        <div className="text-sm text-muted-foreground">{counts.patterns} composites</div>
                    </Link>
                </div>
            </section>

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
