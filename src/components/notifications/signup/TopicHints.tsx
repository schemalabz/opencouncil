'use client';

import { useId, useState } from 'react';
import type { Topic } from '@prisma/client';
import { Check, ChevronRight, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { getLocalizedName } from '@/lib/formatters/name';
import { topicStyle } from '@/lib/topicStyle';
import { cn } from '@/lib/utils';

/**
 * The topics, as hints to Νότης rather than a filter. Shut, it is one row:
 * the hint, or the names already chosen. Open, it is a set of compact chips.
 * Choosing nothing is a whole answer, so there is no «select all».
 *
 * A chosen chip changes in three ways at once (a thicker ring, the topic's
 * wash and a check), so the choice never rests on hue alone.
 */
export function TopicHints({
    topics,
    selected,
    onChange,
    className,
}: {
    topics: Topic[];
    selected: Topic[];
    onChange: (topics: Topic[]) => void;
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const panelId = useId();

    const isSelected = (topic: Topic) => selected.some((s) => s.id === topic.id);
    const toggle = (topic: Topic) =>
        onChange(isSelected(topic) ? selected.filter((s) => s.id !== topic.id) : [...selected, topic]);
    const icon = <SlidersHorizontal className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />;

    if (!open) {
        return (
            <button
                type="button"
                aria-expanded={false}
                onClick={() => setOpen(true)}
                className={cn(surfaceCardClass, 'flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left', className)}
            >
                {icon}
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{t('topics.title')}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {selected.length > 0
                            ? selected.map((topic) => getLocalizedName(topic, locale)).join(', ')
                            : t('topics.hint')}
                    </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px]">
                    {selected.length > 0 ? t('topics.change') : t('topics.choose')}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
            </button>
        );
    }

    return (
        <section id={panelId} aria-label={t('topics.title')} className={cn(surfaceCardClass, 'px-3.5 pb-3.5 pt-1.5', className)}>
            <div className="flex items-center gap-3">
                {icon}
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{t('topics.title')}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {selected.length > 0 ? t('topics.selected', { count: selected.length }) : t('topics.hint')}
                        {selected.length > 0 && (
                            <>
                                <span aria-hidden>·</span>
                                <button
                                    type="button"
                                    onClick={() => onChange([])}
                                    className="-my-3 inline-flex min-h-11 items-center px-1 underline underline-offset-[3px] hover:text-foreground"
                                >
                                    {t('topics.clear')}
                                </button>
                            </>
                        )}
                    </span>
                </span>
                <button
                    type="button"
                    aria-expanded
                    aria-controls={panelId}
                    aria-label={t('topics.close')}
                    onClick={() => setOpen(false)}
                    className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                >
                    <ChevronUp className="h-[18px] w-[18px]" aria-hidden />
                </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                {topics.map((topic) => {
                    const on = isSelected(topic);
                    const style = topicStyle(topic.colorHex);
                    return (
                        <button
                            key={topic.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(topic)}
                            className={cn(
                                'inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm transition-colors',
                                on
                                    ? 'border-2 pl-[9px] pr-[11px]'
                                    : 'border border-foreground/15 bg-card pl-2.5 pr-3 hover:border-foreground/30',
                            )}
                            style={on ? { borderColor: style.border, backgroundColor: style.background } : undefined}
                        >
                            {on ? (
                                <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: style.icon }} aria-hidden />
                            ) : (
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: topic.colorHex }} aria-hidden />
                            )}
                            {getLocalizedName(topic, locale)}
                        </button>
                    );
                })}
            </div>
            <p className="mt-3 text-xs leading-[1.45] text-muted-foreground">{t('topics.footer')}</p>
        </section>
    );
}
