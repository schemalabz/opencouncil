'use client';

import { ArrowRight } from 'lucide-react';
import { Eyebrow } from '@/components/landing/v2/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { Eyebrow };

/**
 * The chrome the signup flows share — notifications and the petition: one
 * layout, one progress bar, one heading, one action bar.
 *
 * One column on a phone. On a desktop the column keeps its measure and a
 * second one appears beside it for what the step is about — Νότης himself,
 * the map, the summary of the choices — so the width is used without
 * stretching a form across it. The aside is sticky, so it stays in view
 * while the column scrolls.
 */
export function SignupLayout({
    children,
    aside,
    className,
}: {
    children: React.ReactNode;
    aside?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mx-auto w-full max-w-md px-4 pb-6 lg:max-w-5xl lg:px-6 lg:pb-16', className)}>
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-14">
                <div className="min-w-0">{children}</div>
                {aside ? <div className="hidden lg:sticky lg:top-24 lg:block">{aside}</div> : null}
            </div>
        </div>
    );
}

/** The segmented progress bar at the top of every step. */
export function SignupProgress({ step, total, label }: { step: number; total: number; label: string }) {
    return (
        <div className="flex items-center gap-1.5 pt-3.5 lg:pt-6" aria-label={label}>
            {Array.from({ length: total }, (_, i) => (
                <span
                    key={i}
                    className={cn(
                        'h-[3px] flex-1 rounded-full transition-colors',
                        i < step ? 'bg-[hsl(var(--orange))]' : 'bg-border',
                    )}
                    aria-hidden
                />
            ))}
            <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{label}</span>
        </div>
    );
}

/**
 * A page's or a step's title and its one-line lead, at the phone's size and
 * the desktop's: the one place the type scale lives. `leading` is what a
 * completion screen puts above the title (the check).
 */
export function StepHeading({
    eyebrow,
    leading,
    title,
    lead,
    className,
}: {
    eyebrow?: string;
    leading?: React.ReactNode;
    title: string;
    lead: string;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-2.5 pt-6 lg:gap-3 lg:pt-8', className)}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {leading}
            <h1 className="text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">{title}</h1>
            <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">{lead}</p>
        </div>
    );
}

/**
 * The action bar. On a phone it sticks to the bottom of the screen: one
 * full-width call to action on the first step, back plus continue on the
 * others. Sticky rather than fixed, so it never covers the page footer. On
 * a desktop it sits in the flow, under the step, where a form's buttons go.
 */
export function SignupFooter({
    actionLabel,
    onAction,
    disabled,
    backLabel,
    onBack,
}: {
    actionLabel: string;
    onAction: () => void;
    disabled?: boolean;
    backLabel?: string;
    onBack?: () => void;
}) {
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:mt-10 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-md items-center justify-between gap-3 lg:mx-0 lg:max-w-none">
                {onBack && backLabel ? (
                    <Button type="button" variant="ghost" onClick={onBack} className="h-11 px-3 text-[15px] text-muted-foreground lg:-ml-3">
                        {backLabel}
                    </Button>
                ) : null}
                <Button
                    type="button"
                    onClick={onAction}
                    disabled={disabled}
                    className={cn(
                        'group/cta h-12 gap-2 rounded-[10px] bg-[hsl(var(--orange-deep))] px-5 text-[15px] font-medium text-white hover:bg-[hsl(var(--orange-deep))]/90',
                        onBack ? 'min-w-[160px]' : 'w-full lg:w-auto lg:min-w-[240px]',
                    )}
                >
                    {actionLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                </Button>
            </div>
        </div>
    );
}
