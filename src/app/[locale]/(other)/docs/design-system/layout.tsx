// layout.tsx
import type { ReactNode } from 'react';
import { DESIGN_CONTEXT_DOCS, getDesignContext, type DesignContextDoc } from '@/lib/design-system/llm-context';
import { DesignWithLLM } from './DesignWithLLM';
import { Sidebar } from './Sidebar';
import { getSidebarSections } from './_registry';

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
    const contexts = Object.fromEntries(
        DESIGN_CONTEXT_DOCS.map((doc) => [doc, getDesignContext(doc)])
    ) as Record<DesignContextDoc, string>;
    const sections = getSidebarSections();

    return (
        <div className="container mx-auto max-w-7xl py-8">
            <header className="flex items-center justify-between gap-4 border-b pb-4 mb-8">
                <div>
                    <h1 className="text-xl font-bold">Design System</h1>
                    <p className="text-sm text-muted-foreground">The record is the interface; the UI recedes.</p>
                </div>
                <DesignWithLLM contexts={contexts} />
            </header>
            <div className="flex gap-10">
                <aside className="hidden w-56 shrink-0 lg:block">
                    <div className="sticky top-20">
                        <Sidebar sections={sections} />
                    </div>
                </aside>
                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
