// src/app/[locale]/(other)/docs/design-system/page.tsx
import type { Metadata } from 'next';
import { DESIGN_CONTEXT_DOCS, getDesignContext, type DesignContextDoc } from '@/lib/design-system/llm-context';
import { SHOWCASE } from './showcase-registry';
import { ComponentShowcase } from './ComponentShowcase';
import { DesignWithLLM } from './DesignWithLLM';
import { AuditTable } from './AuditTable';

export const metadata: Metadata = {
    title: 'Design System · OpenCouncil',
    description: 'OpenCouncil component showcase, cross-folder audit, and LLM design context.',
};

export default function DesignSystemPage() {
    const contexts = Object.fromEntries(
        DESIGN_CONTEXT_DOCS.map((doc) => [doc, getDesignContext(doc)])
    ) as Record<DesignContextDoc, string>;

    return (
        <div className="container mx-auto max-w-5xl py-10 space-y-12">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Design System</h1>
                    <p className="text-muted-foreground mt-1">
                        Live OpenCouncil components — the record is the interface; the UI recedes.
                    </p>
                </div>
                <DesignWithLLM contexts={contexts} />
            </header>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Components</h2>
                <div className="grid gap-4">
                    {SHOWCASE.map((entry) => (
                        <ComponentShowcase
                            key={entry.name}
                            name={entry.name}
                            sourcePath={entry.sourcePath}
                            prompt={entry.prompt}
                        >
                            {entry.sample}
                        </ComponentShowcase>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Cross-folder audit</h2>
                <p className="text-sm text-muted-foreground">
                    Main <code>src/components/ui</code> vs the sibling <code>opencouncil-design</code> app.
                    A consolidation guide — see <code>docs/design-system-audit.md</code>.
                </p>
                <AuditTable />
            </section>
        </div>
    );
}
