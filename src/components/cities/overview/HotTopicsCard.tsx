import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { HotTopicsList } from './HotTopicsList';

interface HotTopicsCardProps {
    cards: HotSubjectCard[];
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * What the council has actually been arguing about — the page's lead content.
 *
 * One list, not a feature plus a list: the leader is its first entry, opened
 * out, and everything below is measured against its debate time. Splitting them
 * would hide that they are one ranking.
 */
export function HotTopicsCard({ cards, cityId, timezone, locale }: HotTopicsCardProps) {
    const t = useTranslations('cityOverview');

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Flame className="h-3.5 w-3.5 text-[hsl(var(--orange))]" aria-hidden />
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                            {t('hotTopicsEyebrow')}
                        </span>
                    </div>
                    <h2 className="mt-2.5 !text-left text-2xl tracking-tight md:text-3xl">{t('hotTopicsTitle')}</h2>
                    <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">{t('hotTopicsExplainer')}</p>
                </div>
            </div>

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
