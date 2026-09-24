import { useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CtaButton } from '@/components/ui/cta-button';
import { notificationsSignupHref } from '@/lib/utils/notificationsSignupHref';
import { NotisChatCard } from './NotisChatCard';

/**
 * The invitation to the notifications: Νότης's box with the playable example
 * conversation, shut to one line on a phone, and the call to action under it.
 * The city page shows it to a reader who is not on that municipality's list;
 * the profile shows it to a reader who is on no list at all.
 */
export function NotisInviteCard({
    city,
    surface,
    className,
}: {
    /** The municipality the invitation is for. Without one it leads to the picker. */
    city?: { id: string; authorityType: string; supportsNotifications: boolean };
    /** Where the card is mounted, carried by the click event. */
    surface: 'city' | 'profile';
    className?: string;
}) {
    const t = useTranslations('cityOverview');
    const intro = city ? t(authorityKey('notisIntro', city)) : t('notisIntro.municipality');

    return (
        <NotisChatCard summary={t('notisTeaser')} intro={intro} className={className}>
            <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                <CtaButton
                    href={notificationsSignupHref(city)}
                    event="notis_invite_cta_clicked"
                    eventProps={city ? { surface, city_id: city.id } : { surface }}
                    className="flex max-w-sm"
                >
                    {t('notisCta')}
                </CtaButton>
                <p className="max-w-sm text-center text-[11px] text-muted-foreground">{t('notisChannels')}</p>
            </div>
        </NotisChatCard>
    );
}
