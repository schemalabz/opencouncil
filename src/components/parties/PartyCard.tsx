import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import type { PartyWithPersons } from '@/lib/db/parties';
import { getLocalizedName } from '@/lib/formatters/name';
import { partyComposition } from '@/lib/party/composition';

/** Faces before the stack becomes a crowd. */
const FACES = 4;

interface PartyCardProps {
    item: PartyWithPersons;
    editable: boolean;
}

/**
 * A party in a list.
 *
 * Leads with council seats, because seat share is what a reader compares. The
 * faces and the "+N" beside them are drawn from whichever set the numeral
 * counts, so the two cannot describe different groups, and a party holding no
 * council seat at all falls back to its roster rather than reading as zero.
 *
 * The party colour is a filled band down the whole left edge, clipped by the
 * card's radius so it follows the curve into the corners.
 *
 * Deliberately hook-light so it renders in a Server Component (the city
 * overview) and inside List, which is a client component.
 */
export default function PartyCard({ item: party }: PartyCardProps) {
    const t = useTranslations('cityOverview');
    const locale = useLocale();
    const { members, councilMembers, council, committee, hasMayor } = partyComposition(party);

    const roster = council > 0 ? councilMembers : members;
    const seatsLabel = council > 0
        ? t('seatsInCouncil', { count: roster.length })
        : t('partyMembers', { count: roster.length });
    const faces = roster.slice(0, FACES);
    const rest = roster.length - faces.length;

    return (
        <Link
            href={`/${party.cityId}/parties/${party.id}`}
            className="group relative flex h-full overflow-hidden rounded-2xl border border-foreground/60 bg-card transition-shadow hover:shadow-md hover:no-underline"
        >
            {/* A filled band, not a border: a border renders as a stroke that thins
                into the 1px sides at the corners. Full height and clipped by the
                card's own radius, so the colour runs the whole left edge and
                follows the curve into the corners instead of stopping short of
                them — hence overflow-hidden on the card. */}
            <span className="absolute inset-y-0 left-0 w-[7px]" style={{ backgroundColor: party.colorHex }} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col p-4">
                <span className="flex min-w-0 items-start gap-3">
                    {party.logo && (
                        <span className="h-10 w-10 shrink-0">
                            <ImageOrInitials
                                imageUrl={party.logo}
                                name={party.name_short}
                                width={40}
                                height={40}
                                color={party.colorHex ?? undefined}
                                square
                            />
                        </span>
                    )}
                    <span className="min-w-0 flex-1 text-[17px] leading-snug transition-colors group-hover:text-[hsl(var(--orange))]">
                        {getLocalizedName(party, locale)}
                    </span>
                </span>

                <span className="mt-2.5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-3xl leading-none tracking-tight" style={{ color: party.colorHex }}>
                        {roster.length}
                    </span>
                    <span className="text-xs text-muted-foreground">{seatsLabel}</span>
                </span>

                {/* Only the governing party is named as such. Which of the others are
                    in opposition and which support the mayor is not in the data, and
                    inferring it would put a political claim on the page.

                    A chip rather than a bold line: it is a standing, not another
                    figure, and the only thing on the card that is not a count. The
                    wash is the party's own colour at low alpha and the text stays
                    foreground, so it reads on a pale παράταξη as well as a dark one. */}
                {(hasMayor || committee > 0) && (
                    <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {hasMayor && (
                            <span
                                className="inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none text-foreground"
                                style={{ backgroundColor: `color-mix(in srgb, ${party.colorHex} 22%, transparent)` }}
                            >
                                {t('governingParty')}
                            </span>
                        )}
                        {committee > 0 && (
                            <span className="text-xs text-muted-foreground">{t('inCommittees', { count: committee })}</span>
                        )}
                    </span>
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
                        {rest > 0 && <span className="text-xs tabular-nums text-muted-foreground">+{rest}</span>}
                    </span>
                )}
            </span>
        </Link>
    );
}
