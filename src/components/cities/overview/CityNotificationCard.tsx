import Image from 'next/image';
import { ArrowRight, Mail, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CityWithCounts } from '@/lib/db/cities';
import type { CityNotificationPreference } from '@/lib/db/notifications';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';

/** Topic chips before the row stops being scannable; the rest become "+N". */
const TOPICS_SHOWN = 2;

interface CityNotificationCardProps {
    city: CityWithCounts;
    /** The signed-in reader's preference for THIS city, or null when they have none. */
    preference: CityNotificationPreference | null;
    locale: string;
}

/**
 * Notifications, beside the meetings module at the head of the city page.
 *
 * Two states of one card. A reader who already gets them wants to know what
 * they are getting — the old control was a dropdown that said only "manage".
 * A reader who does not needs to be told what these are, and the fastest way
 * to explain a message is to show one.
 *
 * A Server Component: everything here is text the server already has, and the
 * card sits above the fold on every city page.
 */
export function CityNotificationCard({ city, preference, locale }: CityNotificationCardProps) {
    if (!city.supportsNotifications) return null;
    return preference
        ? <SubscribedCard city={city} preference={preference} locale={locale} />
        : <InviteCard city={city} locale={locale} />;
}

function InviteCard({ city, locale }: { city: CityWithCounts; locale: string }) {
    const t = useTranslations('cityOverview');

    return (
        <div className="overflow-hidden rounded-2xl border border-foreground/60 bg-card">
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={34}
                    height={34}
                    className="h-[34px] w-[34px] shrink-0 rounded-full object-contain"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{t('notisName')}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {t('notisIntro', { city: getLocalizedMunicipalityName(city, locale) })}
                    </span>
                </span>
            </div>

            {/* The chat surface is the one on the About page's NotificationDemo — same
                wallpaper, same bubble, same palette — so a reader who has seen one
                recognises the other. Labelled as an example: it is written to show
                the shape of a message, and claims nothing about this municipality. */}
            <div
                className="p-3"
                style={{
                    backgroundColor: '#ECE5DD',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c2b7' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
            >
                <div className="relative max-w-[min(92%,26rem)] rounded-lg rounded-tl-none bg-white px-2.5 pb-1.5 pt-2 shadow-[0_1px_1px_rgba(0,0,0,0.09)]">
                    <span
                        className="absolute -left-[7px] top-0 h-0 w-0 border-l-[7px] border-t-[8px] border-l-transparent border-t-white"
                        aria-hidden
                    />
                    <span className="block text-[12px] text-[#075E54]">{t('notisName')}</span>
                    <span className="mt-0.5 block text-[13px] leading-[18px] text-[#111B21]">
                        {t('notisExample')}
                    </span>
                    <span className="mt-0.5 block text-right text-[10.5px] text-[#667781]">
                        {t('notisExampleLabel')}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-3 p-4">
                <p className="max-w-[46ch] text-[13px] leading-relaxed text-foreground/80">{t('notisPitch')}</p>
                <Link
                    href={`/${city.id}/notifications`}
                    className="group/cta flex h-10 max-w-sm items-center justify-center gap-2 rounded-[10px] bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 hover:no-underline"
                >
                    {t('notisCta')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                </Link>
                <p className="max-w-sm text-center text-[11px] text-muted-foreground">{t('notisChannels')}</p>
            </div>
        </div>
    );
}

function SubscribedCard({
    city,
    preference,
    locale,
}: {
    city: CityWithCounts;
    preference: CityNotificationPreference;
    locale: string;
}) {
    const t = useTranslations('cityOverview');
    const topics = preference.interests.slice(0, TOPICS_SHOWN);
    const moreTopics = preference.interests.length - topics.length;
    const [firstLocation, ...otherLocations] = preference.locations;

    const channels = [
        preference.notifyByEmail ? t('channelEmail') : null,
        preference.notifyByPhone ? t('channelPhone') : null,
    ].filter(Boolean);

    return (
        <div className="overflow-hidden rounded-2xl border border-foreground/60 bg-card">
            <div className="flex items-start gap-3 p-4">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={26}
                    height={26}
                    className="mt-0.5 h-[26px] w-[26px] shrink-0 rounded-full object-contain"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="text-sm leading-snug">
                        {t('subscribedTitle', { city: getLocalizedMunicipalityName(city, locale) })}
                    </p>

                    {/* What they will actually be told about. The old control said
                        "manage" and nothing else, so the only way to see this was to
                        leave the page. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {topics.map(topic => (
                            <span
                                key={topic.id}
                                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[11.5px]"
                                style={{ backgroundColor: `color-mix(in srgb, ${topic.colorHex} 14%, white)` }}
                            >
                                <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: topic.colorHex }}
                                    aria-hidden
                                />
                                {getLocalizedName(topic, locale)}
                            </span>
                        ))}
                        {preference.interests.length === 0 && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground">
                                {t('allTopics')}
                            </span>
                        )}
                        {moreTopics > 0 && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground">
                                +{moreTopics}
                            </span>
                        )}
                        {firstLocation && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                {localizeText(firstLocation.text, locale)}
                                {otherLocations.length > 0 && ` +${otherLocations.length}`}
                            </span>
                        )}
                    </div>

                    {channels.length > 0 && (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {channels.join(' · ')}
                        </p>
                    )}
                </div>
            </div>

            {/* Quiet, because they are exits: everything here is a step away from the
                city the reader is looking at. */}
            <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2.5">
                <Link href={`/${city.id}/notifications`} className="text-xs font-semibold text-[hsl(var(--orange))]">
                    {t('changePreferences')}
                </Link>
                <span className="text-border" aria-hidden>·</span>
                <Link href="/profile" className="text-xs text-muted-foreground hover:text-foreground">
                    {t('allMyCities')}
                </Link>
            </div>
        </div>
    );
}
