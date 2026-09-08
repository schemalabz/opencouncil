"use client";
import { useState, type ReactNode } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

interface CityFormSectionProps {
    title: string;
    /** One line naming what is inside, so a section can be skipped unopened. */
    hint?: string;
    defaultOpen?: boolean;
    /** Marks a section a city's own administrators never see. */
    restricted?: boolean;
    children: ReactNode;
}

/**
 * One group of fields in the city form.
 *
 * The form used to be a flat run of fields followed by five collapsibles, each
 * a bare heading with a chevron button beside it — nothing said what was inside
 * one, and only the 36px button opened it. Here the whole header is the target,
 * and the hint under the title is what lets an editor looking for the Diavgeia
 * id skip four sections without opening any of them.
 */
export function CityFormSection({ title, hint, defaultOpen = false, restricted, children }: CityFormSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    // A tighter corner than the resting card: these stack five deep in a form
    // column, where the 16px radius reads as five separate panels.
    return (
        <Collapsible open={open} onOpenChange={setOpen} className={cn(surfaceCardClass, 'rounded-xl')}>
            <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{title}</span>
                        {restricted && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <Lock className="h-2.5 w-2.5" aria-hidden />
                                superadmin
                            </span>
                        )}
                    </span>
                    {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
                </span>
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                    aria-hidden
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="space-y-5 border-t border-border p-4">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}
