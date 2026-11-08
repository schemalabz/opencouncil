'use client';

import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { ArrowRight, Bot } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getPathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * What the model made on the surface the notice sits on: a picture with the
 * text under it, or text alone. The popover's body names exactly that.
 */
export type AIDisclosureKind = 'illustrated' | 'text';

const stopClick = (e: SyntheticEvent) => e.stopPropagation();
const stopActivation = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
};

/**
 * The explanation behind every AI notice: what was made by the model, and a
 * pointer at how the pipeline works. `children` is the trigger — the robot
 * button on a picture, or the text badge beside a summary.
 *
 * Clicks and the keys that stand in for them stay inside the trigger, because
 * the cards around it select themselves on both. A plain anchor rather than
 * the router's Link: the map's popup cards mount in their own React root,
 * outside the router.
 */
export function AIDisclosurePopover({ kind, children }: { kind: AIDisclosureKind; children: ReactNode }) {
    const t = useTranslations('Common');
    const locale = useLocale();

    return (
        <Popover>
            <PopoverTrigger asChild onClick={stopClick} onKeyDown={stopActivation}>
                {children}
            </PopoverTrigger>
            <PopoverContent side="top" align="end" onClick={stopClick} className="w-72 text-left">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                    <Bot className="h-3.5 w-3.5 text-[hsl(var(--orange))]" aria-hidden />
                    {t('aiDisclosure.title')}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {t(kind === 'illustrated' ? 'aiDisclosure.body' : 'aiDisclosure.bodyText')}
                </p>
                <a
                    href={`${getPathname({ href: '/about', locale })}#process`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--orange))]"
                >
                    {t('aiDisclosure.learnMore')}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                </a>
            </PopoverContent>
        </Popover>
    );
}

/**
 * One robot for everything the model made on a surface: the picture and the
 * text under it. It sits on the picture's corner and says nothing until asked.
 */
export function AIDisclosure({ className }: { className?: string }) {
    const t = useTranslations('Common');

    return (
        <AIDisclosurePopover kind="illustrated">
            <button
                type="button"
                aria-label={t('aiDisclosure.label')}
                title={t('aiDisclosure.label')}
                className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                    className,
                )}
            >
                <Bot className="h-[15px] w-[15px]" aria-hidden />
            </button>
        </AIDisclosurePopover>
    );
}
