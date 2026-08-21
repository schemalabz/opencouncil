"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { Clapperboard } from "lucide-react";
import { HighlightCard, type HighlightCardData } from "./HighlightCard";
import type { HighlightSurface } from "@/lib/highlights/analytics";

/**
 * A responsive grid of highlight cards, and the empty state that replaces it.
 * Sectioning a list into groups belongs to the page that knows the groups: this
 * component only lays cards out.
 */
export function HighlightsGrid({
    items,
    surface,
    emptyState,
    action,
    onRenamed,
    onDeleted,
}: {
    items: HighlightCardData[];
    surface: HighlightSurface;
    /** Replaces the default "no highlights yet" copy. */
    emptyState?: { title: string; description: string };
    /** Rendered under the empty copy, and above a non-empty grid. */
    action?: React.ReactNode;
    /** Renamed, for a surface that holds its own copy. */
    onRenamed?: (id: string, name: string) => void;
    /** Deleted, for a surface that holds its own copy. */
    onDeleted?: (id: string) => void;
}) {
    const t = useTranslations('highlights');

    if (items.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                <Clapperboard className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
                <h3 className="mb-1 font-semibold">{emptyState?.title ?? t('emptyState.title')}</h3>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    {emptyState?.description ?? t('emptyState.description')}
                </p>
                {action && <div className="mt-4 flex justify-center">{action}</div>}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {action && <div className="flex justify-center">{action}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map(item => (
                    <HighlightCard
                        key={item.id}
                        data={item}
                        surface={surface}
                        onRenamed={onRenamed}
                        onDeleted={onDeleted}
                    />
                ))}
            </div>
        </div>
    );
}
