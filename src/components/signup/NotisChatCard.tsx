'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { NotisConversation } from '@/components/cities/overview/NotisConversation';
import { RailDisclosure } from '@/components/cities/overview/RailDisclosure';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

/**
 * Νότης in his box: the header a WhatsApp thread has (avatar, name, a
 * one-line about) over the playable example conversation, and whatever the
 * surface puts under it (the city page's call to action). The city page,
 * the signup's first step and the municipality picker show it, because the
 * fastest way to explain what he is, is to let him do it.
 *
 * With a `summary` the box is shut on a phone and open from `lg`, the way
 * the city page's rail cards are: one line and a chevron, so what the page
 * is for stays above the fold.
 */
export function NotisChatCard({
    intro,
    summary,
    className,
    children,
}: {
    intro: string;
    summary?: string;
    className?: string;
    children?: React.ReactNode;
}) {
    const t = useTranslations('cityOverview');
    const body = (
        <>
            <div className={cn('flex items-center gap-3 border-b border-border px-3.5 py-2.5', summary && 'max-lg:border-t')}>
                <Image
                    src="/logo.png"
                    alt=""
                    width={30}
                    height={30}
                    className="h-[30px] w-[30px] shrink-0 rounded-full bg-muted object-contain p-0.5"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{t('notisName')}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{intro}</span>
                </span>
            </div>
            <NotisConversation />
            {children}
        </>
    );

    if (summary) {
        return (
            <RailDisclosure summary={summary} className={className}>
                {body}
            </RailDisclosure>
        );
    }
    return (
        <section className={cn(surfaceCardClass, 'overflow-hidden', className)} aria-label={t('notisName')}>
            {body}
        </section>
    );
}
