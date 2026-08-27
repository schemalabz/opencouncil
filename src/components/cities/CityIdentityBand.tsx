import { useTranslations } from 'next-intl';
import type { CityMessage as CityMessageType } from '@prisma/client';
import type { CityWithCounts } from '@/lib/db/cities';
import { getLocalizedMunicipalityName } from '@/lib/formatters/name';
import { CityMessage } from '@/components/cities/CityMessage';
import { CitySearchForm } from '@/components/cities/CitySearchForm';
import { OfficialSupportBadge } from '@/components/cities/OfficialSupportBadge';

type CityIdentityBandProps = {
    city: CityWithCounts;
    cityMessage: CityMessageType | null;
    showMessage: boolean;
    subjectCount: number;
    locale: string;
};

/**
 * Who this municipality is, and how to search it.
 *
 * It carries no logo. The global header already shows the city's seal in the
 * breadcrumb, and repeating it here was the page's most-noticed flaw — a second
 * copy at four times the size, above a mostly empty band.
 *
 * Deliberately short: everything else that belongs to the city rather than to
 * the tab — the meetings module, notifications, the operator tools — sits in
 * {@link CityRail} beside the content, so the page does not wait for it.
 *
 * A Server Component: everything it renders is text the server already has.
 */
export function CityIdentityBand({
    city,
    cityMessage,
    showMessage,
    subjectCount,
    locale,
}: CityIdentityBandProps) {
    const t = useTranslations('cityOverview');

    // Rich text so the figure carries the weight and the noun stays quiet — the
    // three counts are read as numbers first.
    const numeral = (chunks: React.ReactNode) => (
        <span className="font-medium text-foreground">{chunks}</span>
    );
    const stats = [
        t.rich('statMeetings', { count: city._count.councilMeetings, n: numeral }),
        t.rich('statPeople', { count: city._count.persons, n: numeral }),
        t.rich('statParties', { count: city._count.parties, n: numeral }),
    ];

    return (
        <div className="space-y-6">
            <div className="min-w-0">
                <h1 className="text-3xl leading-none tracking-tight sm:text-4xl md:text-5xl">
                    {getLocalizedMunicipalityName(city, locale)}
                </h1>

                {/* One row, not two. And the counts stand down on a phone: the tab
                    bar a few hundred pixels below names the same three things, and
                    the row cost more than it told anyone. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                    <OfficialSupportBadge
                        status={city.status}
                        authorityType={city.authorityType}
                        cityId={city.id}
                        realm={city.realm}
                        size="sm"
                    />
                    <span className="hidden flex-wrap items-center gap-x-2 gap-y-1 sm:flex">
                        {stats.map((stat, i) => (
                            <span key={i} className="flex items-center gap-2">
                                {i > 0 && <span className="text-muted-foreground/40" aria-hidden>·</span>}
                                {stat}
                            </span>
                        ))}
                    </span>
                </div>

                <div className="mt-5">
                    <CitySearchForm city={city} subjectCount={subjectCount} locale={locale} />
                </div>
            </div>

            {showMessage && cityMessage && (
                <CityMessage
                    message={cityMessage}
                    className={!cityMessage.isActive ? 'opacity-75 border-dashed' : undefined}
                />
            )}
        </div>
    );
}
