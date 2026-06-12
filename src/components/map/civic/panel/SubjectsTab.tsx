"use client"

import { useEffect, useRef } from 'react';
import { AlertCircle, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { MapSubject } from '@/lib/map/types';
import { SubjectListItem } from './SubjectListItem';

/** Panel rows are capped; the map always shows everything. */
export const SUBJECTS_LIST_CAP = 100;

interface SubjectsTabProps {
    subjects: MapSubject[];
    totalCount: number;
    selectedSubjectId: string | null;
    onSelect: (subject: MapSubject | null) => void;
    onHover?: (subjectId: string | null) => void;
    filtersActive: boolean;
    onClearFilters: () => void;
    onZoomOut: () => void;
    error?: boolean;
    onRetry?: () => void;
    /** The mobile drawer's peek row already shows the count. */
    showCount?: boolean;
    /** Overrides the count line (e.g. while a spiderfy fan scopes the list). */
    headerText?: string;
}

export function SubjectsTab({
    subjects,
    totalCount,
    selectedSubjectId,
    onSelect,
    onHover,
    filtersActive,
    onClearFilters,
    onZoomOut,
    error,
    onRetry,
    showCount = true,
    headerText,
}: SubjectsTabProps) {
    const t = useTranslations('map');
    const listRef = useRef<HTMLDivElement>(null);

    // A selection arriving from the map scrolls its row into view.
    useEffect(() => {
        if (!selectedSubjectId || !listRef.current) return;
        const row = listRef.current.querySelector(`[data-subject-id="${selectedSubjectId}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedSubjectId]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <p aria-live="polite" className={showCount || headerText ? 'text-sm text-foreground' : 'sr-only'}>
                    {headerText ?? t('subjectsInView', { count: totalCount })}
                    {filtersActive && (showCount || headerText) && (
                        <>
                            {' · '}
                            <button
                                type="button"
                                onClick={onClearFilters}
                                className="font-medium text-[hsl(24,100%,45%)] hover:underline"
                            >
                                {t('clearFilters')}
                            </button>
                        </>
                    )}
                </p>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {error ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                        <p className="text-sm text-muted-foreground">{t('errorLoading')}</p>
                        {onRetry && (
                            <Button variant="outline" size="sm" onClick={onRetry}>
                                {t('retry')}
                            </Button>
                        )}
                    </div>
                ) : subjects.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                        <MapPinOff className="h-10 w-10 text-muted-foreground/60" />
                        <p className="text-sm text-muted-foreground">{t('noSubjectsInView')}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={onZoomOut}>
                                {t('zoomOut')}
                            </Button>
                            {filtersActive && (
                                <Button variant="ghost" size="sm" onClick={onClearFilters}>
                                    {t('clearFilters')}
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {subjects.slice(0, SUBJECTS_LIST_CAP).map(subject => (
                            <SubjectListItem
                                key={subject.id}
                                subject={subject}
                                expanded={selectedSubjectId === subject.id}
                                onToggle={onSelect}
                                onHover={onHover}
                            />
                        ))}
                        {subjects.length > SUBJECTS_LIST_CAP && (
                            <p className="px-4 py-3 text-center text-xs text-muted-foreground">
                                {t('shownOfTotal', { shown: SUBJECTS_LIST_CAP, total: subjects.length })}
                            </p>
                        )}
                    </>
                )}
            </div>

            <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-muted-foreground">
                {t('aiDisclosure')}
            </p>
        </div>
    );
}
