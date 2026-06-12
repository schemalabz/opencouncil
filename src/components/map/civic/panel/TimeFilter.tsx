"use client"

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { MAP_MONTHS_OPTIONS } from '@/lib/map/constants';

interface TimeFilterProps {
    /** null = a custom date range is active, no preset highlighted. */
    monthsBack: number | null;
    onChange: (monthsBack: number) => void;
    className?: string;
}

/** Segmented time-range control: 1μ / 3μ / 6μ / 12μ. */
export function TimeFilter({ monthsBack, onChange, className }: TimeFilterProps) {
    const t = useTranslations('map');

    return (
        <div
            role="group"
            aria-label={t('timeRange')}
            className={cn('flex h-10 shrink-0 overflow-hidden border border-border bg-background shadow-md', className)}
        >
            {MAP_MONTHS_OPTIONS.map(months => (
                <button
                    key={months}
                    type="button"
                    onClick={() => onChange(months)}
                    aria-pressed={monthsBack === months}
                    className={cn(
                        'px-3 text-[13px] font-medium transition-colors',
                        monthsBack === months
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                >
                    {t('monthsShort', { count: months })}
                </button>
            ))}
        </div>
    );
}
