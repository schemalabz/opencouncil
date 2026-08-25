import { City, CityMessage as CityMessageType } from '@prisma/client';
import { useTranslations } from 'next-intl';
import type { CityWithCounts } from '@/lib/db/cities';
import type { CityNotificationPreference } from '@/lib/db/notifications';
import { getLocalizedMunicipalityName } from '@/lib/formatters/name';
import { CityMessage } from '@/components/cities/CityMessage';
import { CityAdminTools } from '@/components/cities/CityAdminTools';
import { CityHeaderActions } from '@/components/cities/CityHeaderActions';
import { CitySearchForm } from '@/components/cities/CitySearchForm';
import { CityMeetingsModule, type MeetingBookends } from '@/components/cities/overview/CityMeetingsModule';
import { CityNotificationCard } from '@/components/cities/overview/CityNotificationCard';
import { OfficialSupportBadge } from '@/components/cities/OfficialSupportBadge';

type CityIdentityBandProps = {
    city: CityWithCounts;
    cityMessage: CityMessageType | null;
    showMessage: boolean;
    canEdit: boolean;
    isSuperAdmin: boolean;
    hasNoData: boolean;
    notificationPreference: CityNotificationPreference | null;
    allMeetings: MeetingBookends;
    councilMeetings: MeetingBookends;
    subjectCount: number;
    locale: string;
};

/**
 * The head of the city page: who this municipality is, how to search it, and
 * where its council stands right now.
 *
 * It carries no logo. The global header already shows the city's seal in the
 * breadcrumb, and repeating it here was the page's most-noticed flaw — a second
 * copy at four times the size, above a mostly empty band.
 *
 * A Server Component: everything it renders is text the server already has, so
 * nothing here should wait on hydration. The interactive controls live in
 * CityHeaderActions.
 */
export function CityIdentityBand({
    city,
    cityMessage,
    showMessage,
    canEdit,
    isSuperAdmin,
    hasNoData,
    notificationPreference,
    allMeetings,
    councilMeetings,
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
            {/* The identity takes the full width and the two cards share the row
                below it. They used to sit stacked in a 392px rail, which ran twice
                as tall as the identity beside it and left a hole the width of the
                page — and the container caps at 1400px, so a third column would
                only have squeezed the search box to buy that rail back. */}
            <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
                <div className="min-w-0 lg:col-span-2">
                    <h1 className="text-4xl leading-none tracking-tight md:text-5xl">
                        {getLocalizedMunicipalityName(city, locale)}
                    </h1>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <OfficialSupportBadge
                            status={city.status}
                            authorityType={city.authorityType}
                            cityId={city.id}
                            size="sm"
                        />
                    </div>

                    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        {stats.map((stat, i) => (
                            <span key={i} className="flex items-center gap-2">
                                {i > 0 && <span className="text-muted-foreground/40" aria-hidden>·</span>}
                                {stat}
                            </span>
                        ))}
                    </p>

                    <div className="mt-6">
                        <CitySearchForm city={city} subjectCount={subjectCount} locale={locale} />
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <CityMeetingsModule
                        all={allMeetings}
                        council={councilMeetings}
                        cityId={city.id}
                        timezone={city.timezone}
                        locale={locale}
                    />
                    <CityHeaderActions city={city as City} />
                </div>

                <div className="flex flex-col gap-3">
                    {/* Operator controls sit in the corner, above everything a
                        citizen is here for. */}
                    <CityAdminTools
                        city={city as City}
                        cityMessage={cityMessage}
                        canEdit={canEdit}
                        isSuperAdmin={isSuperAdmin}
                        hasNoData={hasNoData}
                    />
                    <CityNotificationCard city={city} preference={notificationPreference} locale={locale} />
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
