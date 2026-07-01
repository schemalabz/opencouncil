'use client';

import { Bell, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters/time';
import type { MunicipalityInterest, UpcomingMeeting } from './landingData';

/* delayed prompt nudging an anonymous, interested visitor toward notifications
   (in-network) or a petition to add their municipality (out-of-network) */
export function NotifyPrompt({
    interest,
    nextMeeting,
    onClose,
    onOptOut,
}: {
    interest: MunicipalityInterest;
    nextMeeting?: UpcomingMeeting;
    /** dismiss for this session (backdrop click) */
    onClose: () => void;
    /** dismiss and persist the opt-out ("Όχι τώρα") */
    onOptOut: () => void;
}) {
    const t = useTranslations('landingV2');
    const known = interest.kind === 'known';
    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="relative w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-4">
                    <span
                        className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14',
                            known ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                    >
                        <Bell className="h-6 w-6 sm:h-7 sm:w-7" />
                    </span>
                    <h3 className="min-w-0 flex-1 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                        {t('notify.interested')}{' '}
                        {interest.kind === 'known' ? interest.nameMunicipality : t('common.dimosName', { name: interest.name })}
                    </h3>
                </div>

                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {known
                        ? t('notify.known')
                        : t('notify.unknown')}
                </p>

                {known && nextMeeting && (
                    <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                        <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
                        <span className="text-foreground/80">
                            <span className="font-semibold text-primary">{t('municipality.nextMeeting')}</span>{' '}
                            {formatDateTime(new Date(nextMeeting.dateTime))}
                        </span>
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
                    {known ? (
                        <Button asChild size="lg" className="sm:flex-1">
                            <Link href={`/${interest.cityId}/notifications`}>
                                <Bell className="h-4 w-4 mr-2" /> {t('notify.enable')}
                            </Link>
                        </Button>
                    ) : (
                        <Button asChild size="lg" className="sm:flex-1">
                            <Link href="/petition">{t('common.requestToAdd')}</Link>
                        </Button>
                    )}
                    <Button variant="ghost" size="lg" onClick={onOptOut}>
                        {t('notify.notNow')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
