import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TrackedLink } from '@/components/analytics/TrackedLink';
import type { CityWithCounts } from '@/lib/db/cities';
import type { PetitionBucket } from '@/lib/landing/petitions';
import { isPetitionable } from '@/lib/cityStatus';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import { authorityKey } from './authorityKey';
import { RailDisclosure } from './RailDisclosure';

interface CityPetitionCardProps {
    city: CityWithCounts;
    /** The public "N+" bucket of the city's petitions, or null under the display threshold. */
    bucket: PetitionBucket | null;
    locale: string;
}

/**
 * The petition, in the rail of a city OpenCouncil does not cover yet.
 *
 * It used to be a lone orange button. Now it is a card in the notification
 * card's family: who is asking, what the reader's name does, how many have
 * asked already — in the same coarse buckets the landing map shows, never an
 * exact count (see lib/landing/petitions) — and one action.
 *
 * A Server Component, like the notification card beside it.
 */
export function CityPetitionCard({ city, bucket, locale }: CityPetitionCardProps) {
    const t = useTranslations('cityOverview');
    if (!isPetitionable(city.status)) return null;
    const qualifier = getMunicipalityQualifier(city, locale);

    return (
        <RailDisclosure summary={t(authorityKey('petitionTeaser', city))}>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 max-lg:border-t">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={34}
                    height={34}
                    className="h-[34px] w-[34px] shrink-0 rounded-full object-contain"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">
                        {t(authorityKey('petitionTitle', city), { qualifier })}
                    </span>
                    {bucket !== null && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {t('petitionCount', { count: bucket })}
                        </span>
                    )}
                </span>
            </div>

            <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                <p className="text-sm leading-snug text-muted-foreground">{t(authorityKey('petitionBody', city))}</p>
                <TrackedLink
                    href={`/${city.id}/petition`}
                    event="petition_opened"
                    eventProps={{ surface: 'city_rail', city_id: city.id }}
                    className="group/cta flex h-10 max-w-sm items-center justify-center gap-2 rounded-[10px] bg-[hsl(var(--orange-deep))] text-sm font-medium text-white transition-opacity hover:opacity-90 hover:no-underline"
                >
                    {t('petitionCta')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                </TrackedLink>
                <p className="max-w-sm text-center text-[11px] text-muted-foreground">{t(authorityKey('petitionNote', city))}</p>
            </div>
        </RailDisclosure>
    );
}
