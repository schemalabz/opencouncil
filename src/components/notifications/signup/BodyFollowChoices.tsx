'use client';

import { useId } from 'react';
import { Landmark } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { getLocalizedName } from '@/lib/formatters/name';
import { cn } from '@/lib/utils';

/**
 * The secondary bodies of the municipality (#829), each behind a tick. A
 * youth council's meetings are not what a subscriber of the municipality
 * signed up for, so its updates come only to the readers who ask for them
 * here. Nothing is ticked until the reader ticks it.
 */
export function BodyFollowChoices({
    bodies,
    selected,
    onChange,
    title,
    hint,
    className,
}: {
    bodies: PublicAdministrativeBody[];
    selected: PublicAdministrativeBody[];
    onChange: (bodies: PublicAdministrativeBody[]) => void;
    /** The heading of the card; by default the one of a signup for the municipality. */
    title?: string;
    hint?: string;
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();
    const groupId = useId();

    const isSelected = (body: PublicAdministrativeBody) => selected.some((s) => s.id === body.id);
    const toggle = (body: PublicAdministrativeBody, on: boolean) =>
        onChange(on ? [...selected.filter((s) => s.id !== body.id), body] : selected.filter((s) => s.id !== body.id));

    return (
        <section aria-labelledby={`${groupId}-title`} className={cn(surfaceCardClass, 'px-3.5 py-3', className)}>
            <div className="flex items-center gap-3">
                <Landmark className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                    <span id={`${groupId}-title`} className="block text-[15px] leading-tight">{title ?? t('bodies.title')}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{hint ?? t('bodies.hint')}</span>
                </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
                {bodies.map((body) => {
                    const id = `${groupId}-${body.id}`;
                    return (
                        <li key={body.id} className="flex items-center gap-3">
                            <Checkbox id={id} checked={isSelected(body)} onCheckedChange={(checked) => toggle(body, checked === true)} />
                            <label htmlFor={id} className="min-h-6 cursor-pointer text-sm leading-6">
                                {getLocalizedName(body, locale)}
                            </label>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
