import { Party, Role } from "@prisma/client";

/**
 * Checks if a role is active at a specific date.
 * @param role Role with startDate and endDate fields
 * @param date Date to check against
 * @returns true if role is active at the given date
 */
export function isRoleActiveAt(role: { startDate: Date | null, endDate: Date | null }, date: Date): boolean {
  // Both dates null = active
  if (!role.startDate && !role.endDate) return true;

  // Only start date set - active if date is after start
  if (role.startDate && !role.endDate) {
    return role.startDate <= date;
  }

  // Only end date set - active if date is before end
  if (!role.startDate && role.endDate) {
    return role.endDate > date;
  }

  // Both dates set - active if date is within range
  if (role.startDate && role.endDate) {
    return role.startDate <= date && role.endDate > date;
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
 * @returns Array of active roles
 */
export function filterActiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(isRoleActive);
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
    return activeRoles.find(role => role.partyId === partyId) || null;
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

/**
 * Gets non-party roles (roles without a partyId) that are active at a specific date.
 * @param roles Array of roles with party relations
 * @param date Date to check for active roles (defaults to current date)
 * @param administrativeBodyId Optional administrative body ID to filter by
 * @returns Array of non-party roles
 */
export function getNonPartyRoles(roles: (Role & { party?: Party | null })[], date?: Date, administrativeBodyId?: string): Role[] {
  const checkDate = date || new Date();
  let filteredRoles = roles.filter(role => !role.partyId).filter(role => isRoleActiveAt(role, checkDate));
  if (administrativeBodyId) {
    filteredRoles = filteredRoles.filter(role => role.administrativeBodyId && role.administrativeBodyId === administrativeBodyId);
  }
  return filteredRoles;
}

/**
 * Gets a single city role from a list of roles.
 * @param roles Array of roles with cityId field
 * @param date Date to check for active roles (defaults to current date)
 * @param administrativeBodyId Optional administrative body ID to filter by
 * @returns The first city role found, or null if none found
 */
export function getSingleCityRole(roles: (Role & { cityId?: string | null })[], date?: Date, administrativeBodyId?: string): Role | null {
  const checkDate = date || new Date();
  const filteredRoles = getNonPartyRoles(roles, checkDate, administrativeBodyId);
  const cityRoles = filteredRoles.filter(role => role.cityId);
  return cityRoles.length > 0 ? cityRoles[0] : null;
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
  return roles.some(role => {
    // Must be active at the check date
    if (!isRoleActiveAt(role, checkDate)) return false;
    
    // City-level role: has cityId but no partyId or administrativeBodyId
    return role.cityId !== null && 
           role.cityId !== undefined && 
           !role.partyId && 
           !role.administrativeBodyId;
  });
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

