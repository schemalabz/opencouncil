'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SubjectCard } from './SubjectCard';
import type { LandingSubject } from './landingData';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';

/**
 * The scrollable subject list, shared by the desktop panel and the mobile sheet. Renders in
 * pages (infinite scroll), scrolls the selected card into view, and shows loading/empty
 * states. `variant` switches the container chrome (desktop = white inset panel; mobile =
 * flush). `footer` is rendered inside the scroll area after the cards (e.g. FewResultsHint).
 */
export function SubjectList({
    subjects,
    selectedId,
    onSelect,
    loading,
    variant,
    footer,
}: {
    subjects: LandingSubject[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    variant: 'desktop' | 'mobile';
    footer?: ReactNode;
}) {
    const t = useTranslations('landingV2');
    const listRef = useRef<HTMLDivElement>(null);
    const selectedIndex = selectedId ? subjects.findIndex((s) => s.id === selectedId) : -1;
    const { visible, onScroll } = useInfiniteScroll(subjects, { ensureIndex: selectedIndex });

    // Scroll the selected subject's card into view once the list has rendered. `subjects` is a
    // dep so a deep-linked selection scrolls in once its card appears (and on viewport changes).
    useEffect(() => {
        if (!selectedId) return;
        const container = listRef.current;
        const el = container?.querySelector<HTMLElement>(`[data-subject-id="${selectedId}"]`);
        if (!container || !el) return;
        // Scroll WITHIN the list only — scrollIntoView would also scroll the whole page.
        const top = container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top) - 8;
        container.scrollTo({ top, behavior: 'smooth' });
    }, [selectedId, subjects]);

    return (
        <div
            ref={listRef}
            onScroll={onScroll}
            className={cn(
                'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto',
                variant === 'desktop' ? 'mb-3 bg-muted/50 px-4 py-4' : 'px-4 py-4',
            )}
        >
            {loading && <div className="py-6 text-center text-sm text-muted-foreground">{t('list.loading')}</div>}
            {!loading && subjects.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{t('list.emptyLocated')}</div>}
            {visible.map((s) => (
                // scroll-mt leaves a breather above the card when aligned to the top
                <div key={s.id} data-subject-id={s.id} className={variant === 'desktop' ? 'scroll-mt-4' : 'scroll-mt-2'}>
                    <SubjectCard subject={s} variant="expanded" selected={s.id === selectedId} onClick={() => onSelect(s.id)} />
                </div>
            ))}
            {footer}
        </div>
    );
}
