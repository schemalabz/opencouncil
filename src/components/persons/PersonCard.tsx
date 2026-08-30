import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import type { PersonWithRelations } from '@/lib/db/people';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { cn, filterActiveRoles } from '@/lib/utils';
import { getPartyFromRoles, getRoleText, sortRolesByPriority } from '@/lib/utils/roles';
import { surfaceCardClass } from '@/components/ui/surface-card';

/** Titled roles before the card stops being a summary. */
const ROLES_SHOWN = 2;

interface PersonCardProps {
    item: PersonWithRelations;
    editable: boolean;
}

/**
 * A person in a list.
 *
 * Their party is the card's left border, the same way a party card carries its
 * own colour — so a grid of people reads as the grid of parties it comes from,
 * and someone scanning for one παράταξη can find its members by colour alone.
 *
 * The roles are the point of the card. Only titled ones are listed: a bare
 * membership in an administrative body says nothing a reader cannot infer, and
 * showing every one of them buried the two that mattered.
 *
 * Deliberately hook-light so it renders in a Server Component and inside List,
 * which is a client component.
 */
export default function PersonCard({ item: person }: PersonCardProps) {
    const t = useTranslations('Person');
    const locale = useLocale();
    const party = getPartyFromRoles(person.roles);
    // getRoleText, not `role.name`: two thirds of councillors hold no titled
    // role, and filtering on the name column left their cards with an empty role
    // area. The helper falls back to the administrative body, or to "member".
    // Sorted before the slice, and before the map that would throw the sort key
    // away: `sortRolesByPriority` puts a mayor first, then a deputy mayor, then a
    // body chair, then plain membership. Slicing the raw relation order instead
    // hid an αντιδήμαρχος behind "+1" while showing two committee seats — the
    // Prisma include carries no `orderBy`.
    const roles = sortRolesByPriority(filterActiveRoles(person.roles).filter(role => !role.partyId))
        .map(role => getRoleText(role, t));
    const shown = roles.slice(0, ROLES_SHOWN);
    const rest = roles.length - shown.length;

    return (
        <Link
            href={`/${person.cityId}/people/${person.id}`}
            className={cn(surfaceCardClass, "group relative flex h-full overflow-hidden transition-shadow hover:shadow-md hover:no-underline")}
        >
            {/* A filled band, not a border: a border renders as a stroke that thins
                into the 1px sides at the corners. Full height and clipped by the
                card's own radius, so the colour runs the whole left edge and
                follows the curve into the corners instead of stopping short of
                them — hence overflow-hidden on the card. */}
            <span className="absolute inset-y-0 left-0 w-[7px]" style={{ backgroundColor: party?.colorHex ?? 'hsl(var(--border))' }} aria-hidden />
            <span className="flex min-w-0 flex-1 items-start gap-3 p-4">
                <span className="h-12 w-12 shrink-0">
                    <ImageOrInitials
                        imageUrl={person.image}
                        name={person.name}
                        width={48}
                        height={48}
                        color={party?.colorHex ?? undefined}
                    />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug transition-colors group-hover:text-[hsl(var(--orange))]">
                        {localizeText(person.name, locale)}
                    </span>

                    {party && (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {getLocalizedName(party, locale)}
                        </span>
                    )}

                    {shown.length > 0 && (
                        <span className="mt-2 flex flex-col gap-0.5">
                            {shown.map(role => (
                                <span key={role} className="truncate text-xs text-foreground/80">
                                    {localizeText(role, locale)}
                                </span>
                            ))}
                            {rest > 0 && (
                                <span className="text-xs text-muted-foreground">{t('moreRoles', { count: rest })}</span>
                            )}
                        </span>
                    )}
                </span>
            </span>
        </Link>
    );
}
