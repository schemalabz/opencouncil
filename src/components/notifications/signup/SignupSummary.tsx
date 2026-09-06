'use client';

import { MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { CitySeal } from '@/components/signup/CityCard';
import { Eyebrow } from '@/components/signup/SignupChrome';
import { TopicPill } from '@/components/TopicPill';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { cn } from '@/lib/utils';
import type { SignupState } from './signup-state';

/**
 * Beside step 3 on a desktop: what the reader chose so far, live, so the
 * channels are picked with the places and the topics in view. A phone has
 * no room for it, and the steps are one screen apart there anyway.
 */
export function SignupSummary({
    city,
    state,
    onEdit,
}: {
    city: CityWithGeometry;
    state: SignupState;
    onEdit: () => void;
}) {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();
    const channels = [state.phoneChannel ? t('phoneChannel') : null, state.emailChannel ? t('summaryEmail') : null].filter(
        (c): c is string => c !== null,
    );

    return (
        <section className={cn(surfaceCardClass, 'p-4')} aria-label={t('summaryEyebrow')}>
            <Eyebrow>{t('summaryEyebrow')}</Eyebrow>
            <div className="mt-3 flex items-center gap-3">
                <CitySeal name={city.name} logoImage={city.logoImage} size={34} />
                <span className="text-[15px] leading-tight">{getLocalizedMunicipalityName(city, locale)}</span>
            </div>

            <dl className="mt-4 flex flex-col gap-3.5">
                <SummaryRow label={t('summaryPlaces')}>
                    {state.locations.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                            {state.locations.map((location, i) => (
                                <li key={`${location.text}-${i}`} className="flex items-start gap-1.5 text-sm">
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                    {location.text}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <span className="text-sm text-muted-foreground">{t(authorityKey('summaryNoPlaces', city))}</span>
                    )}
                </SummaryRow>
                <SummaryRow label={t('summaryTopics')}>
                    {state.topics.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {state.topics.map((topic) => (
                                <TopicPill key={topic.id} label={getLocalizedName(topic, locale)} icon={topic.icon} colorHex={topic.colorHex} />
                            ))}
                        </div>
                    ) : (
                        <span className="text-sm text-muted-foreground">{t('summaryAllTopics')}</span>
                    )}
                </SummaryRow>
                <SummaryRow label={t('summaryChannels')}>
                    <span className={cn('text-sm', channels.length === 0 && 'text-muted-foreground')}>
                        {channels.length > 0 ? channels.join(' · ') : t('summaryNoChannel')}
                    </span>
                </SummaryRow>
            </dl>

            <button
                type="button"
                onClick={onEdit}
                className="mt-4 inline-flex min-h-9 items-center text-[13px] text-[hsl(var(--orange-deep))] hover:underline"
            >
                {t('summaryEdit')}
            </button>
        </section>
    );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}
