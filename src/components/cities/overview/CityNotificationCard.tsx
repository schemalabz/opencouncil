import { Suspense } from 'react';
import Image from 'next/image';
import { ArrowRight, Mail, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CityWithCounts } from '@/lib/db/cities';
import type { CityNotificationPreference } from '@/lib/db/notifications';
import { getLocalizedName, getMunicipalityQualifier } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { authorityKey } from './authorityKey';
import { NotisConversation } from './NotisConversation';
import { TopicPill } from '@/components/TopicPill';
import { FactDot } from '@/components/ui/fact-dot';
import { RailDisclosure } from './RailDisclosure';
import { TrackedLink } from '@/components/analytics/TrackedLink';

/** Topic chips before the row stops being scannable; the rest become "+N". */
const TOPICS_SHOWN = 2;

interface CityNotificationCardProps {
    city: CityWithCounts;
    /** The signed-in reader's preference for THIS city, or null when they have none. */
    preference: CityNotificationPreference | null;
    /**
     * The reader's WhatsApp channel as Notis has it, still being asked: the
     * card streams that one line in rather than hold the page for it. `null`
     * when Notis did not answer, and the card says nothing about it.
     */
    phoneChannel: Promise<boolean | null>;
    locale: string;
}

/**
 * Notifications, beside the meetings module at the head of the city page.
 *
 * Two states of one card. A reader who already gets them wants to know what
 * they are getting — the old control was a dropdown that said only "manage".
 * A reader who does not gets an exchange they can play through, because the
 * fastest way to explain what Νότης is, is to let him do it.
 *
 * A Server Component: everything here is text the server already has, and the
 * card sits above the fold on every city page.
 */
export function CityNotificationCard({ city, preference, phoneChannel, locale }: CityNotificationCardProps) {
    if (!city.supportsNotifications) return null;
    if (preference) return <SubscribedCard city={city} preference={preference} phoneChannel={phoneChannel} locale={locale} />;
    return <InviteCard city={city} locale={locale} />;
}

function InviteCard({ city, locale }: { city: CityWithCounts; locale: string }) {
    const t = useTranslations('cityOverview');

    return (
        <RailDisclosure summary={t('notisTeaser')}>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 max-lg:border-t">
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
                        {t(authorityKey('notisIntro', city))}
                    </span>
                </span>
            </div>

            <NotisConversation />

            <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                <TrackedLink
                    href={`/${city.id}/notifications`}
                    event="notis_invite_cta_clicked"
                    eventProps={{ city_id: city.id }}
                    className="group/cta flex h-10 max-w-sm items-center justify-center gap-2 rounded-[10px] bg-[hsl(var(--orange-deep))] text-sm font-medium text-white transition-opacity hover:opacity-90 hover:no-underline"
                >
                    {t('notisCta')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                </TrackedLink>
                <p className="max-w-sm text-center text-[11px] text-muted-foreground">{t('notisChannels')}</p>
            </div>
        </RailDisclosure>
    );
}

function SubscribedCard({
    city,
    preference,
    phoneChannel,
    locale,
}: {
    city: CityWithCounts;
    preference: CityNotificationPreference;
    phoneChannel: Promise<boolean | null>;
    locale: string;
}) {
    const t = useTranslations('cityOverview');
    const topics = preference.interests.slice(0, TOPICS_SHOWN);
    const moreTopics = preference.interests.length - topics.length;
    const [firstLocation, ...otherLocations] = preference.locations;

    const emailLabel = preference.notifyByEmail ? t('channelEmail') : null;
    const phoneLabel = t('channelPhone');

    return (
        <RailDisclosure summary={t('subscribedSummary')}>
            <div className="flex items-start gap-3 p-4 max-lg:border-t max-lg:border-border">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={26}
                    height={26}
                    className="mt-0.5 h-[26px] w-[26px] shrink-0 rounded-full object-contain"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="text-sm leading-snug">
                        {t(authorityKey('subscribedTitle', city), { qualifier: getMunicipalityQualifier(city, locale) })}
                    </p>

                    {/* What they will actually be told about. The old control said
                        "manage" and nothing else, so the only way to see this was to
                        leave the page. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {topics.map(topic => (
                            <TopicPill key={topic.id} label={getLocalizedName(topic, locale)} icon={topic.icon} colorHex={topic.colorHex} />
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

                    {/* The email part is known at once; the WhatsApp part is
                        Notis's answer and arrives when it does. */}
                    <Suspense fallback={<ChannelsLine labels={[emailLabel]} />}>
                        <PhoneChannelsLine emailLabel={emailLabel} phoneLabel={phoneLabel} phoneChannel={phoneChannel} />
                    </Suspense>
                </div>
            </div>

            {/* Quiet, because they are exits: everything here is a step away from the
                city the reader is looking at. */}
            <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2.5">
                {/* Straight to the places and topics: this reader has read the explainer. */}
                <Link href={`/${city.id}/notifications?step=2`} className="text-xs font-semibold text-[hsl(var(--orange))]">
                    {t('changePreferences')}
                </Link>
                <FactDot className="text-border" />
                <Link href="/profile" className="text-xs text-muted-foreground hover:text-foreground">
                    {t('allMyCities')}
                </Link>
            </div>
        </RailDisclosure>
    );
}

async function PhoneChannelsLine({
    emailLabel,
    phoneLabel,
    phoneChannel,
}: {
    emailLabel: string | null;
    phoneLabel: string;
    phoneChannel: Promise<boolean | null>;
}) {
    const phone = await phoneChannel;
    return <ChannelsLine labels={[emailLabel, phone === true ? phoneLabel : null]} />;
}

function ChannelsLine({ labels }: { labels: (string | null)[] }) {
    const shown = labels.filter((label): label is string => label !== null);
    if (shown.length === 0) return null;
    return (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {shown.join(' · ')}
        </p>
    );
}
