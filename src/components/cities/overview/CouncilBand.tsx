import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import PartyCard from '@/components/parties/PartyCard';
import type { CityWithCounts } from '@/lib/db/cities';
import type { PartyWithPersons } from '@/lib/db/parties';
import type { PersonWithRelations } from '@/lib/db/people';
import { getLocalizedName } from '@/lib/formatters/name';
import { sortParties } from '@/lib/sorting/parties';
import { sortPeople } from '@/lib/sorting/people';
import { getPartyFromRoles, isRoleActive } from '@/lib/utils/roles';
import { localizeText } from '@/lib/serbian';

/** Parties shown before the list stops being a summary of who holds the room. */
const PARTIES_SHOWN = 3;
/** Faces per party card. */
const FACES_PER_PARTY = 4;
/** People in the preview strip — three by three where the columns fit. */
const PEOPLE_SHOWN = 9;

interface CouncilBandProps {
    parties: PartyWithPersons[];
    people: PersonWithRelations[];
    city: CityWithCounts;
    locale: string;
}

/**
 * Who holds the council: the largest parties, then the faces behind them.
 *
 * A Server Component on purpose. Every party here carries its full roster, and
 * each of those people carries their roles — so rendering the counts on the
 * client would put the whole city's personnel into the payload to draw three
 * numbers. Nothing crosses the boundary but the markup.
 */
export function CouncilBand({ parties, people, city, locale }: CouncilBandProps) {
    const t = useTranslations('cityOverview');

    if (parties.length === 0 && people.length === 0) return null;

    const shown = sortParties(parties).slice(0, PARTIES_SHOWN);
    const ordered = sortPeople(people, parties, city.peopleOrdering).slice(0, PEOPLE_SHOWN);

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('councilEyebrow')}
                    </span>
                    <h2 className="mt-2.5 !text-left text-2xl tracking-tight md:text-3xl">{t('councilTitle')}</h2>
                </div>
                {parties.length > PARTIES_SHOWN && (
                    <Link
                        href={`/${city.id}/parties`}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange))]"
                    >
                        {t('allParties')}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                )}
            </div>

            {shown.length > 0 && (
                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map(party => (
                        <PartyCard key={party.id} item={party} editable={false} />
                    ))}
                </div>
            )}

            {ordered.length > 0 && (
                <div className="mt-6 rounded-2xl border border-foreground/60 bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                            {t('peopleEyebrow', { count: city._count.persons })}
                        </span>
                        <Link
                            href={`/${city.id}/people`}
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--orange))]"
                        >
                            {t('allPeople')}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                    </div>
                    {/* Three columns at most. Five left about 135px for a name, and Greek
                        ones do not fit that — "Αλεξάνδρα Έβερτ Αλβέρτη" was cut after
                        its first word. */}
                    <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                        {ordered.map(person => (
                            <PersonRow key={person.id} person={person} cityId={city.id} locale={locale} />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

function PersonRow({ person, cityId, locale }: { person: PersonWithRelations; cityId: string; locale: string }) {
    const party = getPartyFromRoles(person.roles);
    const role = person.roles.find(r => isRoleActive(r) && r.name);
    // Most councillors hold no titled role, so the party carries the second line
    // instead. Something is there either way, which keeps the rows one height.
    const caption = role
        ? getLocalizedName(role as { name: string; name_en: string | null }, locale)
        : party && getLocalizedName(party, locale);

    return (
        <Link
            href={`/${cityId}/people/${person.id}`}
            className="group flex min-w-0 items-start gap-3 hover:no-underline"
        >
            <span className="mt-0.5 h-10 w-10 shrink-0">
                <ImageOrInitials
                    imageUrl={person.image}
                    name={person.name}
                    width={40}
                    height={40}
                    color={party?.colorHex ?? undefined}
                />
            </span>
            <span className="min-w-0">
                <span className="block text-sm leading-snug transition-colors line-clamp-2 group-hover:text-[hsl(var(--orange))]">
                    {localizeText(person.name, locale)}
                </span>
                {caption && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{caption}</span>
                )}
            </span>
        </Link>
    );
}
