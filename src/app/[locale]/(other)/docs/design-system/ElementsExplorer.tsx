// ElementsExplorer.tsx — foundations + elements explorer with select → Design/Code prompt
'use client';

import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Copy, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ExplorerGroup = 'branding' | 'palette' | 'typography' | 'components' | 'patterns';

export interface ExplorerItem {
    group: ExplorerGroup;
    id: string;
    name: string;
    preview: ReactNode;
    /** snippet for the Code prompt */
    code: string;
    /** styles/usage for the Design prompt */
    design: string;
    /** detail-page link (components/patterns) */
    href?: string;
}

const GROUPS: { key: ExplorerGroup; label: string; cols: string }[] = [
    { key: 'branding', label: 'Branding', cols: 'sm:grid-cols-2 lg:grid-cols-4' },
    { key: 'palette', label: 'Palette', cols: 'sm:grid-cols-3 lg:grid-cols-4' },
    { key: 'typography', label: 'Typography', cols: 'sm:grid-cols-2' },
    { key: 'components', label: 'Components', cols: 'sm:grid-cols-2' },
    { key: 'patterns', label: 'Patterns', cols: 'sm:grid-cols-2' },
];

export function ElementsExplorer({ items }: { items: ExplorerItem[] }) {
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState<'design' | 'code' | null>(null);

    const keyOf = (i: ExplorerItem) => `${i.group}/${i.id}`;

    const toggle = (k: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });

    const toggleMode = () =>
        setSelectMode((on) => {
            if (on) setSelected(new Set());
            return !on;
        });

    const selectedItems = items.filter((i) => selected.has(keyOf(i)));

    const generate = async (kind: 'design' | 'code') => {
        const origin = window.location.origin;
        const intro =
            kind === 'design'
                ? 'Design for OpenCouncil — a civic-transparency platform for Greek municipal council meetings. Register: square, plain, exact controls; Civic Flame orange and the one brand gradient reserved for primary actions; the record is the interface, the UI recedes.\n\nApply these OpenCouncil styles:'
                : 'Build a UI for OpenCouncil — a civic-transparency platform for Greek municipal council meetings. Register: square, plain, exact controls; Civic Flame orange and the one brand gradient reserved for primary actions; the record is the interface, the UI recedes.\n\nUse these OpenCouncil elements:';

        const blocks = selectedItems.map((i) => {
            const body = kind === 'design' ? i.design : i.code;
            return `### ${i.name} — ${i.group}\n${body}`;
        });

        const footer = `Follow OpenCouncil's full design + product rules (read these in full): ${origin}/api/design-context/combined`;
        const prompt = [intro, ...blocks, footer].join('\n\n');

        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(kind);
            setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    const checkbox = (isSel: boolean) => (
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', isSel ? 'bg-foreground text-background' : 'border-input')}>
            {isSel && <Check className="h-3 w-3" />}
        </span>
    );

    return (
        <div className="space-y-8">
            {/* Select & generate controls — sit above all sections */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-4 py-3">
                <Button variant={selectMode ? 'secondary' : 'outline'} size="sm" onClick={toggleMode}>
                    <Sparkles className="h-4 w-4 mr-1" />
                    {selectMode ? 'Cancel selection' : 'Select and generate prompt'}
                </Button>
                {selectMode && (
                    <>
                        <span className="text-sm text-muted-foreground">{selectedItems.length} selected</span>
                        <div className="ml-auto flex gap-2">
                            <Button size="sm" onClick={() => generate('design')} disabled={selectedItems.length === 0}>
                                {copied === 'design' ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                                Generate Design prompt
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => generate('code')} disabled={selectedItems.length === 0}>
                                {copied === 'code' ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                                Generate Code prompt
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {GROUPS.map(({ key, label, cols }) => {
                const groupItems = items.filter((i) => i.group === key);
                if (groupItems.length === 0) return null;
                return (
                    <section key={key} className="space-y-3">
                        <h2 className="text-lg font-semibold">{label}</h2>
                        <div className={cn('grid gap-3', cols)}>
                            {groupItems.map((i) => {
                                const k = keyOf(i);
                                const isSel = selected.has(k);
                                const body = (
                                    <>
                                        <div className="flex items-center gap-2">
                                            {selectMode && checkbox(isSel)}
                                            <span className="truncate text-sm font-medium flex-1">{i.name}</span>
                                            {!selectMode && i.href && (
                                                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                                            )}
                                        </div>
                                        <div className="pointer-events-none select-none overflow-hidden">{i.preview}</div>
                                    </>
                                );
                                const cardCls = 'flex flex-col gap-2 rounded-md border p-3 text-left transition-colors';
                                if (selectMode) {
                                    return (
                                        <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={isSel}
                                            className={cn(cardCls, isSel ? 'border-foreground/30 bg-secondary/40' : 'hover:bg-secondary/30')}>
                                            {body}
                                        </button>
                                    );
                                }
                                if (i.href) {
                                    return (
                                        <Link key={k} href={i.href} className={cn(cardCls, 'group no-underline hover:bg-secondary/30 hover:no-underline')}>
                                            {body}
                                        </Link>
                                    );
                                }
                                return <div key={k} className={cardCls}>{body}</div>;
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
