import { useTranslations } from 'next-intl';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { HotTopicsList } from './HotTopicsList';
import { HotTopicsFilters } from './HotTopicsFilters';
import type { HotPeriod, HotScope } from '@/lib/utils/hotTopicFilters';

interface HotTopicsCardProps {
    cards: HotSubjectCard[];
    cityId: string;
    timezone: string;
    locale: string;
    scope: HotScope;
    period: HotPeriod;
    availableScopes: HotScope[];
    /** The period held no meetings, so the ranking shows the most recent ones. */
    beyondPeriod: boolean;
}

/**
 * What the council has actually been arguing about — the page's lead content.
 *
 * One list, not a feature plus a list: the leader is its first entry, opened
 * out, and everything below is measured against its debate time. Splitting them
 * would hide that they are one ranking.
 */
export function HotTopicsCard({ cards, cityId, timezone, locale, scope, period, availableScopes, beyondPeriod }: HotTopicsCardProps) {
    const t = useTranslations('cityOverview');

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('hotTopicsEyebrow')}
                    </span>
                    <h2 className="mt-2.5 !text-left text-2xl tracking-tight md:text-3xl">{t('hotTopicsTitle')}</h2>
                    <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">{t('hotTopicsExplainer')}</p>
                </div>
                <HotTopicsFilters scope={scope} period={period} availableScopes={availableScopes} />
            </div>

            {beyondPeriod && (
                <p className="mt-4 text-xs text-muted-foreground">{t('hotTopicsBeyondPeriod')}</p>
            )}

            {cards.length > 0 ? (
                <div className="mt-6">
                    <HotTopicsList cards={cards} cityId={cityId} timezone={timezone} locale={locale} />
                </div>
            ) : (
                <p className="mt-6 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    {t('noHotTopics')}
                </p>
            )}
        </section>
    );
}
