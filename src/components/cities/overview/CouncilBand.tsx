import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import type { CityWithCounts } from '@/lib/db/cities';
import type { PartyWithPersons } from '@/lib/db/parties';
import type { PersonWithRelations } from '@/lib/db/people';
import { getLocalizedName } from '@/lib/formatters/name';
import { partyComposition } from '@/lib/party/composition';
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
                        <PartySummary key={party.id} party={party} locale={locale} />
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

function PartySummary({ party, locale }: { party: PartyWithPersons; locale: string }) {
    const t = useTranslations('cityOverview');
    const { members, councilMembers, council, committee, hasMayor } = partyComposition(party);

    // Council seats are the figure a reader is comparing, but a party can hold
    // none and still exist — a κοινότητα-only list, or a city whose council
    // roles are not recorded. Falling back to the roster keeps the numeral true.
    // The faces come from whichever set the numeral counts, so the "+N" beside
    // them and the numeral above cannot describe two different groups.
    const roster = council > 0 ? councilMembers : members;
    const seatsLabel = council > 0 ? t('seatsInCouncil', { count: roster.length }) : t('partyMembers', { count: roster.length });
    const faces = roster.slice(0, FACES_PER_PARTY);
    const rest = roster.length - faces.length;

    // Only the governing party is named as such. Which of the others are in
    // opposition and which support the mayor is not in the data, and guessing
    // would put a political claim on the page that nothing here can support.
    const standing = [
        hasMayor ? t('mayorsParty') : null,
        committee > 0 ? t('inCommittees', { count: committee }) : null,
    ].filter(Boolean);

    return (
        // The party colour is the card's left border, not a strip inside it. A
        // strip is clipped by the corner radius, so on a 16px-rounded card the
        // colour appears to start 16px down and stop 16px short. As a border it
        // follows the curve, and begins where the rounding does.
        <Link
            href={`/${party.cityId}/parties/${party.id}`}
            className="group flex h-full rounded-2xl border border-l-[5px] border-foreground/60 bg-card transition-shadow hover:shadow-md hover:no-underline"
            style={{ borderLeftColor: party.colorHex }}
        >
            <span className="flex min-w-0 flex-1 flex-col p-4">
                <span className="block text-[17px] leading-snug transition-colors group-hover:text-[hsl(var(--orange))]">
                    {getLocalizedName(party, locale)}
                </span>

                <span className="mt-2.5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-3xl leading-none tracking-tight" style={{ color: party.colorHex }}>
                        {roster.length}
                    </span>
                    <span className="text-xs text-muted-foreground">{seatsLabel}</span>
                </span>

                {standing.length > 0 && (
                    <span className="mt-1.5 block text-xs text-muted-foreground">{standing.join(' · ')}</span>
                )}

                {faces.length > 0 && (
                    <span className="mt-auto flex items-center gap-2.5 pt-3.5">
                        {/* Ringed against the card: every face here shares the party's
                            colour, so without a gap between them the stack reads as one
                            shape rather than as four people. */}
                        <span className="flex -space-x-2.5">
                            {faces.map(person => (
                                <span key={person.id} className="h-8 w-8 rounded-full ring-2 ring-card">
                                    <ImageOrInitials
                                        imageUrl={person.image}
                                        name={person.name}
                                        width={32}
                                        height={32}
                                        color={party.colorHex ?? undefined}
                                    />
                                </span>
                            ))}
                        </span>
                        {rest > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">+{rest}</span>
                        )}
                    </span>
                )}
            </span>
        </Link>
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
