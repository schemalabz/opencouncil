'use client';

import Image from 'next/image';
import { CalendarDays, Check, CornerUpLeft, ExternalLink, Settings2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { OsektutuBanner } from '@/components/onboarding/OsektutuBanner';
import { MeanwhileLinks, type MeanwhileLink } from '@/components/signup/MeanwhileLinks';
import { maskPhone } from '@/components/signup/signup-shared';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import { findOsektutuNeighbourhood } from '@/lib/osektutu';
import type { Location } from '@/lib/types/onboarding';
import { cn } from '@/lib/utils';

/** The WhatsApp wallpaper the city page's example conversation uses. */
const CHAT_SURFACE = { backgroundColor: '#ECE5DD' };

/**
 * Done. What happens next, honestly: the first message comes in minutes —
 * or in the morning, because enrollment holds through the quiet hours —
 * and here is what it will say, because the intro shell is fixed text.
 * A reader Νότης already knows gets no intro: for them the next message
 * is the next meeting that concerns them, and the screen says so.
 * The "meanwhile" links sit under it on a phone and beside it on a desktop
 * (CompleteAside).
 */
export function CompleteScreen({
    city,
    locations,
    phone,
    email,
    phoneChannel,
    known,
    signedIn,
}: {
    city: CityWithGeometry;
    locations: Location[];
    phone: string;
    email: string;
    phoneChannel: boolean;
    /** Νότης has a subscription for this reader already: nothing new is sent. */
    known: boolean;
    signedIn: boolean;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    const tc = useTranslations('cityOverview');
    const osektutuNeighbourhood = findOsektutuNeighbourhood(locations);
    const maskedPhone = phone ? maskPhone(phone) : t('yourPhone');
    const intro = phoneChannel && !known;

    return (
        <div>
            <div className="flex flex-col gap-3 pt-6 lg:pt-10">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600" aria-hidden>
                    <Check className="h-5 w-5 text-white" strokeWidth={2.6} />
                </span>
                <h1 className="mt-1 text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">
                    {!phoneChannel ? t('doneTitleEmailOnly') : known ? t('doneTitleKnown') : t('doneTitle')}
                </h1>
                <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">
                    {!phoneChannel
                        ? t('doneLeadEmailOnly', { email })
                        : known
                          ? t('doneLeadKnown', { phone: maskedPhone })
                          : t('doneLead', { phone: maskedPhone })}
                </p>
            </div>

            {intro && (
                <section className={cn(surfaceCardClass, 'mt-5 overflow-hidden lg:mt-7')} aria-label={t('firstMessageLabel')}>
                    <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                        <Image
                            src="/logo.png"
                            alt=""
                            width={30}
                            height={30}
                            className="h-[30px] w-[30px] shrink-0 rounded-full bg-muted object-contain p-0.5"
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] leading-tight">{tc('notisName')}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                {tc(authorityKey('notisIntro', city))}
                            </span>
                        </span>
                    </div>
                    <div className="flex flex-col gap-1 p-3" style={CHAT_SURFACE}>
                        <span className="mb-1 self-center rounded-lg bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                            {t('firstMessageLabel')}
                        </span>
                        <div className="relative max-w-[88%] self-start rounded-[10px] rounded-tl-[2px] bg-white px-2.5 pb-1.5 pt-2 text-[13.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                            {t('firstMessageBody')}
                            <span className="mt-1.5 block text-xs text-[#8696a0]">{t('firstMessageFooter')}</span>
                        </div>
                        <span className="flex w-[88%] items-center justify-center gap-1.5 rounded-[10px] bg-white py-2 text-[13.5px] text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            {t('firstMessageMore')}
                        </span>
                        <span className="flex w-[88%] items-center justify-center gap-1.5 rounded-[10px] bg-white py-2 text-[13.5px] text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                            <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                            {t('firstMessageReply')}
                        </span>
                    </div>
                </section>
            )}

            <MeanwhileLinks className="mt-7 lg:hidden" eyebrow={t('meanwhileEyebrow')} items={useMeanwhile(city, signedIn)} />

            {osektutuNeighbourhood && (
                <div className="mt-6">
                    <OsektutuBanner neighbourhood={osektutuNeighbourhood} cityId={city.id} />
                </div>
            )}

            <p className="mt-4 pb-8 text-[11px] leading-[1.45] text-muted-foreground lg:mt-6 lg:text-xs">
                {!signedIn && <>{ts('doneMagicLink')} </>}
                {t('doneStop')}
            </p>
        </div>
    );
}

/** Beside the completion screen on a desktop: where to go in the meantime. */
export function CompleteAside({ city, signedIn }: { city: CityWithGeometry; signedIn: boolean }) {
    const t = useTranslations('notificationSignup');
    return <MeanwhileLinks eyebrow={t('meanwhileEyebrow')} items={useMeanwhile(city, signedIn)} />;
}

function useMeanwhile(city: CityWithGeometry, signedIn: boolean): MeanwhileLink[] {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);
    return [
        {
            href: `/${city.id}`,
            icon: CalendarDays,
            title: t('meanwhileMeeting'),
            hint: t(authorityKey('meanwhileMeetingHint', city), { qualifier }),
        },
        {
            href: signedIn ? '/profile?tab=notifications' : '/sign-in?callbackUrl=%2Fprofile%3Ftab%3Dnotifications',
            icon: Settings2,
            title: t('meanwhilePreferences'),
            hint: t('meanwhilePreferencesHint'),
        },
    ];
}
