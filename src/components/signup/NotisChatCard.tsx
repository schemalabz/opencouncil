'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { NotisConversation } from '@/components/cities/overview/NotisConversation';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

/**
 * Νότης in his box: the header a WhatsApp thread has (avatar, name, a
 * one-line about) over the playable example conversation the city page
 * already carries. The signups' first steps and both municipality pickers
 * show it, because the fastest way to explain what he is, is to let him
 * do it.
 */
export function NotisChatCard({ intro, className }: { intro: string; className?: string }) {
    const t = useTranslations('cityOverview');
    return (
        <section className={cn(surfaceCardClass, 'overflow-hidden', className)} aria-label={t('notisName')}>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
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
        </section>
    );
}
