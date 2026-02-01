import { Party, Role } from "@prisma/client";

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
 * Gets a single non-party role from a list of roles.
 * If administrativeBodyId is provided, returns the admin body role.
 * Otherwise, returns a city-level role (role with no party or admin body).
 *
 * NOTE: This function supports both role patterns:
 * - Pattern A: cityId always set (cityId as scope)
 * - Pattern B: cityId only for city-level roles
 *
 * @param roles Array of roles with cityId field
 * @param date Date to check for active roles (defaults to current date)
 * @param administrativeBodyId Optional administrative body ID to filter by
 * @returns The first matching role found, or null if none found
 */
export function getSingleCityRole(roles: (Role & { cityId?: string | null })[], date?: Date, administrativeBodyId?: string): Role | null {
  const checkDate = date || new Date();
  const filteredRoles = getNonPartyRoles(roles, checkDate, administrativeBodyId);

  if (administrativeBodyId) {
    // If looking for a specific admin body role, return the first match
    return filteredRoles.length > 0 ? filteredRoles[0] : null;
  }

  // Otherwise, we want city-level roles (no admin body)
  const cityLevelRoles = filteredRoles.filter(role => !role.administrativeBodyId);
  return cityLevelRoles.length > 0 ? cityLevelRoles[0] : null;
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

