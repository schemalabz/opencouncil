"use client";

import { Users, Shapes } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type BarMode = 'speakers' | 'subjects';

/**
 * The bar's colour language, as a vertical pair of glyphs: people for the
 * party colours, shapes for the topic colours. Symbols, not words — the
 * labels ride on title/aria.
 */
export function ModePicker({ mode, onModeChange, compact = false }: {
    mode: BarMode;
    onModeChange: (mode: BarMode) => void;
    compact?: boolean;
}) {
    const t = useTranslations('transcript.controls');
    const cell = (value: BarMode, icon: React.ReactNode, label: string) => (
        <button
            type="button"
            onClick={() => onModeChange(value)}
            title={label}
            aria-label={label}
            aria-pressed={mode === value}
            className={cn(
                'flex flex-1 items-center justify-center transition-colors',
                mode === value ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:text-foreground',
            )}
        >
            {icon}
        </button>
    );
    const iconSize = compact ? 'h-3.5 w-3.5' : 'h-[15px] w-[15px]';
    return (
        <div
            className={cn(
                'flex shrink-0 flex-col overflow-hidden rounded-[10px] border-2 border-border bg-card',
                compact ? 'h-[42px] w-9' : 'h-[50px] w-11',
            )}
            role="group"
            aria-label={t('modePicker')}
        >
            {cell('speakers', <Users className={iconSize} aria-hidden />, t('modeSpeakers'))}
            <div className="h-0 border-t-2 border-border" aria-hidden />
            {cell('subjects', <Shapes className={iconSize} aria-hidden />, t('modeSubjects'))}
        </div>
    );
}
