import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Export time formatters from the new location
export {
  formatTime,
  formatTimestamp,
  formatDuration,
  formatRelativeTime,
  formatDate,
  formatDateTime,
  formatDateRange
} from './formatters/time';

// Export role utilities from the new location
export {
  isRoleActive,
  isRoleActiveAt,
  filterActiveRoles,
  filterInactiveRoles,
  getDateRangeFromRoles,
  getActivePartyRole,
  getPartyFromRoles,
  getNonPartyRoles,
  getSingleCityRole,
  hasCityLevelRole,
  getActiveRoleCondition,
  getRoleNameForPerson
} from './utils/roles';

// Export extracted domain utilities to maintain backward compatibility during refactor
export { klitiki, normalizeText } from './utils/greek';
export {
  SUBJECT_POINT_COLOR,
  subjectToMapFeature,
  calculateGeometryBounds,
  type GeometryBounds
} from './utils/geo';
export {
  type SortableSubject,
  sortSubjectsByImportance,
  sortSubjectsBySpeakingTime,
  sortSubjectsByAgendaIndex
} from './utils/subjects';
export {
  UNKNOWN_SPEAKER_LABEL,
  buildUnknownSpeakerLabel,
  joinTranscriptSegments
} from './utils/transcript';
export { getMeetingMediaType } from './utils/meeting';

// Re-export calculateOfferTotals from the pricing module for backward compatibility
export { calculateOfferTotals } from './pricing'

export const IS_DEV = process.env.NODE_ENV === 'development';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(value);
}

export function monthsBetween(startDate: Date, endDate: Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  // Round to nearest month - periods > 15 days count as a full month
  const diffMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30));
  return diffMonths;
}

/**
 * Builds a URL for city navigation
 * Handles the special case for opencouncil.chania.gr
 * 
 * @param cityId The ID of the city
 * @param path Additional path after the city ID
 * @param locale The locale to use for the URL
 * @returns A URL string for navigation
 */
export function buildCityUrl(cityId: string, path: string = '', locale: string = 'el'): string {
  // Check if we're in browser 
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Special case for opencouncil.chania.gr
    if (hostname === 'opencouncil.chania.gr') {
      // On opencouncil.chania.gr, all URLs should be relative without the /chania prefix
      if (cityId === 'chania') {
        return path ? `/${path}` : '/';
      } else {
        // If linking to another city, use path-based URL
        return `/${locale}/${cityId}${path ? `/${path}` : ''}`;
      }
    }
  }

  // Default path-based URL structure
  return `/${locale}/${cityId}${path ? `/${path}` : ''}`;
}
