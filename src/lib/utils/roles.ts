import { AdministrativeBodyType, Party, Role } from "@prisma/client";
import { RoleWithRelations } from "@/lib/db/types";
import { localizeText } from "@/lib/serbian";

/**
 * Validation error type for role validation
 */
export type RoleValidationError = {
  error: string;
};

/**
 * Validates an array of roles against business rules.
 * Supports both role patterns:
 * - Pattern A: cityId always set (cityId as scope) - Recommended
 * - Pattern B: cityId only for city-level roles (cityId as role type)
 *
 * Validation rules:
 * 1. Cannot have both partyId and administrativeBodyId set
 * 2. If cityId is set, it must match the expected cityId
 * 3. City-level roles (no party/admin body) MUST have cityId
 * 4. Party roles must reference valid parties for the city
 * 5. Administrative body roles must reference valid admin bodies for the city
 *
 * @param roles Array of roles to validate
 * @param cityId Expected city ID that roles should belong to
 * @param validPartyIds Set of valid party IDs for the city
 * @param validAdminBodyIds Set of valid administrative body IDs for the city
 * @returns null if valid, or an error object if validation fails
 */
export function validateRoles(
  roles: Array<{
    cityId?: string | null;
    partyId?: string | null;
    administrativeBodyId?: string | null;
  }>,
  cityId: string,
  validPartyIds: Set<string>,
  validAdminBodyIds: Set<string>
): RoleValidationError | null {
  for (const role of roles) {
    // Count entity types (excluding cityId from count)
    const entityTypes = [role.partyId, role.administrativeBodyId].filter(Boolean).length;

    // Rule 1: Cannot have multiple entity types (party + admin body)
    if (entityTypes > 1) {
      return {
        error: 'Each role must be assigned to at most one entity type (party or administrative body, not both).'
      };
    }

    // Rule 2: If cityId is set, it must match the current city
    if (role.cityId && role.cityId !== cityId) {
      return {
        error: 'Role cityId must match the current city.'
      };
    }

    // Rule 3: City-level roles (no party/admin body) MUST have cityId
    if (entityTypes === 0 && !role.cityId) {
      return {
        error: 'City-level role must have cityId.'
      };
    }

    // Rule 4: Validate party roles
    if (role.partyId) {
      if (!validPartyIds.has(role.partyId)) {
        return {
          error: 'Invalid party role assignment. Party must belong to the current city.'
        };
      }
    }

    // Rule 5: Validate administrative body roles
    if (role.administrativeBodyId) {
      if (!validAdminBodyIds.has(role.administrativeBodyId)) {
        return {
          error: 'Invalid administrative body role assignment. Administrative body must belong to the current city.'
        };
      }
    }
  }

  return null;
}

/**
 * The roles a body admin may give a person (#828): at least one, each on a
 * body they administer, none on a party and none city-level. An empty set of
 * bodies says the viewer may not change roles at all (a person who claimed
 * their own page edits name and photo only).
 */
export function validateRolesForBodyAdmin(
  roles: Array<{
    cityId?: string | null;
    partyId?: string | null;
    administrativeBodyId?: string | null;
  }>,
  heldBodyIds: ReadonlySet<string>
): RoleValidationError | null {
  if (heldBodyIds.size === 0) {
    return { error: 'You may not change the roles of this person.' };
  }
  if (roles.length === 0) {
    return { error: 'The person needs at least one role on an administrative body you administer.' };
  }
  for (const role of roles) {
    if (role.partyId) {
      return { error: 'You may not give party roles.' };
    }
    if (!role.administrativeBodyId) {
      return { error: 'You may not give city-level roles.' };
    }
    if (!heldBodyIds.has(role.administrativeBodyId)) {
      return { error: 'Every role must be on an administrative body you administer.' };
    }
  }
  return null;
}

/**
 * Checks if a role is active at a specific date.
 * @param role Role with startDate and endDate fields
 * @param date Date to check against
 * @returns true if role is active at the given date
 */
export function isRoleActiveAt(role: { startDate: Date | null, endDate: Date | null }, date: Date): boolean {
  // Normalize dates to handle string values from JSON serialization (e.g. unstable_cache,
  // or a meeting.dateTime serialized when passed to a Client Component).
  // new Date(Date) is a no-op, new Date(isoString) correctly parses strings.
  const start = role.startDate ? new Date(role.startDate) : null;
  const end = role.endDate ? new Date(role.endDate) : null;
  const at = new Date(date);

  // Both dates null = active
  if (!start && !end) return true;

  // Only start date set - active if date is after start
  if (start && !end) {
    return start <= at;
  }

  // Only end date set - active if date is before end
  if (!start && end) {
    return end > at;
  }

  // Both dates set - active if date is within range
  if (start && end) {
    return start <= at && end > at;
  }

  return false;
}

/**
 * Checks if a role is currently active (at the current date).
 * @param role Role with startDate and endDate fields
 * @returns true if role is currently active
 */
export function isRoleActive(role: { startDate: Date | null, endDate: Date | null }): boolean {
  const now = new Date();
  return isRoleActiveAt(role, now);
}

/**
 * Filters roles to only include active ones.
 * @param roles Array of roles with startDate and endDate fields
 * @param at Date to check against (defaults to now)
 * @returns Array of active roles
 */
export function filterActiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[], at?: Date): T[] {
  return roles.filter(role => at ? isRoleActiveAt(role, at) : isRoleActive(role));
}

/**
 * Filters roles to only include inactive ones.
 * @param roles Array of roles with startDate and endDate fields
 * @returns Array of inactive roles
 */
export function filterInactiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(role => !isRoleActive(role));
}

/**
 * Calculates the date range from multiple roles by finding the earliest start date
 * and latest end date. Returns null for dates that don't exist or are invalid.
 * @param roles Array of roles with startDate and endDate fields
 * @returns Object with startDate and endDate (both Date | null)
 */
export function getDateRangeFromRoles<T extends { startDate: Date | null, endDate: Date | null }>(
  roles: T[]
): { startDate: Date | null, endDate: Date | null } {
  // Get valid start date timestamps
  const startTimestamps = roles
    .filter(role => role.startDate)
    .map(role => {
      const timestamp = new Date(role.startDate!).getTime();
      return isFinite(timestamp) ? timestamp : null;
    })
    .filter((ts): ts is number => ts !== null);

  // Get valid end date timestamps
  const endTimestamps = roles
    .filter(role => role.endDate)
    .map(role => {
      const timestamp = new Date(role.endDate!).getTime();
      return isFinite(timestamp) ? timestamp : null;
    })
    .filter((ts): ts is number => ts !== null);

  // Calculate min start date and max end date
  const minStartTimestamp = startTimestamps.length > 0 ? Math.min(...startTimestamps) : null;
  const maxEndTimestamp = endTimestamps.length > 0 ? Math.max(...endTimestamps) : null;

  // Create Date objects only if we have valid timestamps
  const startDate = minStartTimestamp !== null ? new Date(minStartTimestamp) : null;
  const endDate = maxEndTimestamp !== null ? new Date(maxEndTimestamp) : null;

  // Validate dates before returning
  const validStartDate = startDate && isFinite(startDate.getTime()) ? startDate : null;
  const validEndDate = endDate && isFinite(endDate.getTime()) ? endDate : null;

  return { startDate: validStartDate, endDate: validEndDate };
}

/** The fields a party-membership test reads off a role. */
type PartyRoleFields = { partyId: string | null; startDate: Date | null; endDate: Date | null };

/**
 * Whether a role is a role in this party, whether or not it has ended.
 *
 * The history-wide half of the membership test. Use it only where the surface
 * deliberately shows a party's past — a past-members list, the date range across
 * every term someone served. Everywhere else use {@link isActivePartyRole}.
 */
export function isPartyRole(role: { partyId: string | null }, partyId: string): boolean {
    return role.partyId === partyId;
}

/**
 * Whether a role puts its holder in this party now.
 *
 * The active test is load-bearing and was easy to forget: `getPartiesForCity`
 * filters the party's own roles relation but not the nested `person.roles`, so a
 * councillor who left the παράταξη last term is still on the record. Written out
 * by hand, the pair drifted apart across the party surfaces and counted defectors
 * as members. Every "is this person in this party now" test goes through here or
 * {@link isActivePartyMember}.
 */
export function isActivePartyRole(role: PartyRoleFields, partyId: string): boolean {
    return isPartyRole(role, partyId) && isRoleActive(role);
}

/** Whether a person holds a role in this party that has not ended. */
export function isActivePartyMember(person: { roles: PartyRoleFields[] }, partyId: string): boolean {
    return person.roles.some(role => isActivePartyRole(role, partyId));
}

/**
 * Finds the first active party role from a list of roles.
 * @param roles Array of roles with party relations
 * @param partyId Optional party ID to filter by
 * @param date Date to check for active roles (defaults to current date)
 * @returns The first active party role, or null if none found
 */
export function getActivePartyRole<T extends Role & { partyId?: string | null }>(
  roles: T[],
  partyId?: string,
  date?: Date
): T | null {
  const checkDate = date || new Date();

  // Filter roles that are active at the specified date
  const activeRoles = roles.filter(role => isRoleActiveAt(role, checkDate));

  // Find the first role that has a party (and matches partyId if provided)
  if (partyId) {
    return activeRoles.find(role => isPartyRole(role, partyId)) || null;
  }
  return activeRoles.find(role => role.partyId) || null;
}

/**
 * Extracts party affiliation from a list of roles at a specific date.
 * @param roles Array of roles with party relations
 * @param date Date to check for active roles (defaults to current date)
 * @returns The party from the first active party role, or null if none found
 */
export function getPartyFromRoles(
  roles: (Role & { party?: Party | null })[],
  date?: Date): Party | null {
  const checkDate = date || new Date();

  // Filter roles that are active at the specified date
  const activeRoles = roles.filter(role => isRoleActiveAt(role, checkDate));

  // Find the first role that has a party
  const activePartyRole = activeRoles.find(role => role.party);

  return activePartyRole?.party || null;
}

/** What a role is attached to. A role carries at most one of a party and a body (validateRoles). */
export type RoleKind = 'city' | 'body' | 'party';

type RoleKindFields = { cityId?: string | null; partyId?: string | null; administrativeBodyId?: string | null };

/**
 * Whether a role is a party role, a role on an administrative body, or a
 * city-level office (mayor, deputy mayor, general secretary). Null for a role
 * attached to nothing.
 */
export function getRoleKind(role: RoleKindFields): RoleKind | null {
  if (role.partyId) return 'party';
  if (role.administrativeBodyId) return 'body';
  if (role.cityId) return 'city';
  return null;
}

/**
 * Returns a numeric priority for a role type (lower = higher priority).
 * City-level roles rank highest, then admin body heads (council president, committee chair),
 * then party roles, then regular admin body members.
 *
 * TODO: Regular admin body roles should rank higher when viewing a meeting of that admin body
 * (e.g. a council member role should rank above a party role when viewing a council meeting).
 * This will require passing context (e.g. administrativeBodyId) to the sorting function.
 */
export function getRoleTypePriority(role: { isHead: boolean; cityId?: string | null; partyId?: string | null; administrativeBodyId?: string | null }): number {
  const kind = getRoleKind(role);
  if (kind === 'city') return role.isHead ? 0 : 1; // mayor, deputy mayor
  if (kind === 'body' && role.isHead) return 2;   // council president, committee chair
  if (kind === 'party') return role.isHead ? 3 : 4; // party leader, party member
  if (kind === 'body') return 5;                   // regular admin body member
  return 6;
}

/**
 * Sorts roles by display priority:
 * 1. City-level roles with isHead (mayor)
 * 2. City-level roles (deputy mayor)
 * 3. Admin body roles with isHead (council president, committee chair)
 * 4. Party roles with isHead (party leader)
 * 5. Party roles
 * 6. Admin body roles (regular member)
 *
 * Returns a new sorted array without mutating the input.
 */
export function sortRolesByPriority<T extends { isHead: boolean; cityId?: string | null; partyId?: string | null; administrativeBodyId?: string | null }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => getRoleTypePriority(a) - getRoleTypePriority(b));
}

/**
 * Returns the highest-priority role from a list.
 * Wraps sortRolesByPriority to name the common "pick the most prominent role" concept.
 * Generic so callers keep their concrete type (e.g. RoleWithRelations).
 */
export function getPrimaryRole<T extends {
  isHead: boolean;
  cityId?: string | null;
  partyId?: string | null;
  administrativeBodyId?: string | null;
}>(roles: T[]): T | null {
  const sorted = sortRolesByPriority(roles);
  return sorted[0] ?? null;
}

type SpeakerRole = Role & {
  party?: Party | null;
  cityId?: string | null;
  administrativeBody?: { type: AdministrativeBodyType } | null;
};

/**
 * A member of the Δημοτικό Συμβούλιο who holds no active party role.
 * Roles must carry their administrativeBody: without it no role counts as a council membership.
 */
export function isIndependentCouncilMember(
  roles: { partyId: string | null; startDate: Date | null; endDate: Date | null; administrativeBody?: { type: AdministrativeBodyType } | null }[],
  date?: Date
): boolean {
  const activeRoles = filterActiveRoles(roles, date);
  return !activeRoles.some(role => role.partyId)
    && activeRoles.some(role => role.administrativeBody?.type === 'council');
}

/**
 * The text a document prints after a speaker's name: the short party name, the
 * party label to print («ΝΔ, Επικεφαλής» for the head of the party), and the
 * role title (getRoleTitle), or the independent label for a council member
 * without a party.
 */
export function getSpeakerLabels(roles: SpeakerRole[], titles: RoleTitles, date?: Date): {
  party: string | null;
  partyLabel: string | null;
  role: string | null;
} {
  const { party, role, isPartyHead, isIndependent } = getSpeakerDisplayInfo(roles, date);
  const shortName = party?.name_short ?? null;
  return {
    party: shortName,
    partyLabel: shortName && isPartyHead ? `${shortName}, ${titles.t('partyLeader')}` : shortName,
    role: simplifyRoleName(role ? getRoleTitle(role, titles) : null) ?? (isIndependent ? titles.t('independentCouncilMember') : null),
  };
}

/**
 * Derives speaker display information from roles at a specific date.
 * Centralizes the logic for determining what to show for a person:
 * - Uses getPrimaryRole to find the most prominent non-party role
 * - City-level roles (mayor, deputy mayor) have highest priority
 * - Admin body head roles (council president) are included
 * - Party affiliation is resolved separately
 * - isPartyHead indicates the person leads their party (suppressed for
 *   city-level heads like the mayor, where it's always implied)
 * - Independent per isIndependentCouncilMember
 *
 * @param roles Array of roles with their party and administrativeBody relations.
 *   Without `administrativeBody.type` no role counts as a council seat, and
 *   isIndependent is always false.
 * @param date Date to check for active roles (defaults to current date)
 * @returns Object with party, role, party head status, and independent status
 */
export function getSpeakerDisplayInfo(
  roles: SpeakerRole[],
  date?: Date
): {
  party: Party | null;
  role: Role | null;
  isPartyHead: boolean;
  isIndependent: boolean;
} {
  const party = getPartyFromRoles(roles, date);

  const checkDate = date || new Date();
  const activeRoles = roles.filter(role => isRoleActiveAt(role, checkDate));
  const primaryRole = getPrimaryRole(activeRoles);

  // Use primary role only if it's a non-party role
  // (party roles are shown separately via the party field)
  const role = primaryRole && !primaryRole.partyId ? primaryRole : null;
  const isIndependent = isIndependentCouncilMember(roles, checkDate);

  // Party head status: true when the active party role has isHead,
  // but suppressed when the displayed role is already city-level head (mayor)
  // since the mayor is always the party leader — showing both is redundant.
  const activePartyRole = activeRoles.find(r => r.partyId);
  const isCityHead = role !== null && isMayorRole(role);
  const isPartyHead = activePartyRole?.isHead === true && !isCityHead;

  return { party, role, isPartyHead, isIndependent };
}

/**
 * Checks if a single role is the city mayor role.
 * Mayor = city-level role (cityId set, no partyId or administrativeBodyId) with isHead.
 */
export function isMayorRole(role: RoleKindFields & { isHead: boolean }): boolean {
  return getRoleKind(role) === 'city' && role.isHead;
}

/**
 * Whether the mayor sits on this body and votes like a member. On the Δημοτικό
 * Συμβούλιο and a Κοινότητα never: the mayor attends and does not vote, whatever
 * role the roster holds (Chalandri, Papagos and Argithea hold one without dates).
 * On the Δημοτική Επιτροπή only when the roster gives the mayor an active role on
 * it — the mayor can preside there and then votes; Argithea's mayor is not on its
 * committee. Per-subject rows leave the mayor out wherever this is false.
 */
export function mayorIsMemberOf(
  mayor: { roles: Array<{ administrativeBodyId?: string | null; startDate: Date | null; endDate: Date | null }> },
  body: { id: string; type: AdministrativeBodyType } | null | undefined,
  date: Date,
): boolean {
  return body?.type === 'committee' && mayor.roles.some(r => r.administrativeBodyId === body.id && isRoleActiveAt(r, date));
}

/**
 * The title to print under an elected member's name: the city-level role
 * (Δήμαρχος, Αντιδήμαρχος …) when there is one, else the council role
 * (Πρόεδρος …), else the community role. Plain council members have none:
 * the council is the strip's default context. A community role always names
 * its community, because which one is the point ("Πρόεδρος - 3η Δημοτική
 * Κοινότητα", or the community alone for a member). Pass active roles only.
 */
export function getCouncilTitle(roles: RoleTextFields[], titles: RoleTitles): string | null {
  const title = (role: TitleFields | undefined) => role ? getRoleTitle(role, titles) : null;
  const communityRole = roles.find((r) => r.administrativeBody?.type === 'community');
  return title(roles.find((r) => getRoleKind(r) === 'city'))
    ?? title(roles.find((r) => r.administrativeBody?.type === 'council'))
    ?? (communityRole ? getRoleText(communityRole, titles) : null);
}

/** The fields a mayor test reads off a role. */
type MayorRoleFields = {
  isHead: boolean;
  cityId?: string | null;
  partyId?: string | null;
  administrativeBodyId?: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

/**
 * Whether a person holds the city's mayor role now.
 *
 * The person-level half of {@link isMayorRole}, which several surfaces spelled
 * out by hand. Every "is this the mayor" test belongs here, so a change to the
 * rule reaches all of them.
 */
export function isMayor(person: { roles: MayorRoleFields[] }): boolean {
  return person.roles.some(role => isRoleActive(role) && isMayorRole(role));
}

/**
 * Simplify vice-mayor role names for document output.
 * Keeps everything up to and including "Αντιδήμαρχος", dropping portfolio details.
 *
 * "Αντιδήμαρχος Τεχνικών Έργων" → "Αντιδήμαρχος"
 * "Αναπληρωτής Δήμαρχος και Αντιδήμαρχος Οικονομικών..." → "Αναπληρωτής Δήμαρχος και Αντιδήμαρχος"
 */
export function simplifyRoleName(name: string | null): string | null {
  if (!name) return null;
  const keyword = 'Αντιδήμαρχος';
  // NFKC folds the micro sign (µ) that some records carry for μ, and keeps
  // the length, so the index is valid in the original text.
  const idx = name.normalize('NFKC').indexOf(keyword);
  if (idx !== -1) return name.slice(0, idx + keyword.length);
  return name;
}

/**
 * Checks if a person has a city-level role (mayor or deputy mayor).
 * City-level roles are identified by having cityId set but no partyId or administrativeBodyId.
 * @param roles Array of roles to check
 * @param date Optional date to check for active roles (defaults to current date)
 * @returns true if person has an active city-level role
 */
export function hasCityLevelRole(
  roles: (Role & { cityId?: string | null; partyId?: string | null; administrativeBodyId?: string | null })[],
  date?: Date
): boolean {
  const checkDate = date || new Date();
  return roles.some(role => isRoleActiveAt(role, checkDate) && getRoleKind(role) === 'city');
}

/**
 * Generates Prisma query conditions for finding active roles at a specific date.
 * @param date Date to check for active roles (defaults to current date)
 * @returns Array of OR conditions for Prisma queries
 */
export function getActiveRoleCondition(date: Date = new Date()) {
  return [
    // Both dates are null (ongoing role)
    { startDate: null, endDate: null },
    // Only start date is set and it's in the past
    { startDate: { lte: date }, endDate: null },
    // Only end date is set and it's in the future
    { startDate: null, endDate: { gt: date } },
    // Both dates are set and current time is within range
    {
      startDate: { lte: date },
      endDate: { gt: date }
    }
  ];
}

/**
 * The translation keys the role titles need. Satisfied by useTranslations('Person')
 * on the client and getTranslations({ namespace: 'Person' }) on the server.
 *
 * @translationNamespace Person
 */
export type RoleTextTranslator = (key: 'mayor' | 'president' | 'partyLeader' | 'member' | 'independentCouncilMember') => string;

/**
 * What every role title needs: the `Person` catalog and the locale it is in.
 * Server code gets one with getRoleTitles (src/i18n/roleTitles.ts), in the
 * city's language for documents and task requests; components with useRoleTitles.
 */
export interface RoleTitles {
  t: RoleTextTranslator;
  locale: string;
}

type TitleFields = RoleKindFields & { isHead: boolean; name: string | null };

/** The title each kind of head holds without a stored name. */
const HEAD_TITLE_KEY = { city: 'mayor', body: 'president', party: 'partyLeader' } as const;

/**
 * The title of one role. A head's title follows from what it heads — a city
 * head is the mayor, a body head the president, a party head its leader — and
 * a stored name overrides it. `name_en` is not read: it holds machine
 * translations of uneven quality.
 *
 * The stored name is written in the realm's language. Every locale but `en`
 * belongs to a realm (see computeForeignLocales in src/lib/realm.ts), so `en`
 * is the one locale where the stored name is foreign: there the translated head
 * title wins, and a role that is not a head keeps its stored name.
 */
export function getRoleTitle(role: TitleFields, { t, locale }: RoleTitles): string | null {
  const kind = getRoleKind(role);
  const headTitle = role.isHead && kind ? t(HEAD_TITLE_KEY[kind]) : null;
  const stored = role.name ? localizeText(role.name, locale) : null;
  const storedNameIsForeign = locale === 'en';
  return storedNameIsForeign ? headTitle ?? stored : stored ?? headTitle;
}

/**
 * The role fields getRoleText reads. A RoleWithRelations fits; so does a
 * narrower select that carries the party and body names.
 */
export type RoleTextFields = TitleFields & {
  party?: { name: string } | null;
  administrativeBody?: { name: string; type: AdministrativeBodyType } | null;
};

/**
 * Human-readable text for a single role — the label the site's badges render:
 * the title (getRoleTitle) with the party or the body it belongs to.
 */
export function getRoleText(role: RoleTextFields, titles: RoleTitles): string {
  const title = getRoleTitle(role, titles);

  if (role.partyId && role.party) {
    const text = role.party.name;
    if (role.isHead) return `${text} (${title})`;
    return title ? `${text} - ${title}` : text;
  }

  if (role.administrativeBodyId && role.administrativeBody) {
    return title ? `${title} - ${role.administrativeBody.name}` : role.administrativeBody.name;
  }

  return title ?? titles.t('member');
}

/**
 * The label for a person's most prominent role active at a date — the same
 * text the site's badges render (getPrimaryRole + getRoleText). Null when no
 * role is active at that date.
 */
export function getRoleLabelAt(
  roles: RoleWithRelations[] | undefined,
  titles: RoleTitles,
  at: Date
): string | null {
  const primary = getPrimaryRole(filterActiveRoles(roles ?? [], at));
  return primary ? getRoleText(primary, titles) : null;
}
