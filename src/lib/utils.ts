import { Offer, Party, Role, Subject, Topic } from "@prisma/client";
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Statistics } from "./statistics";
import { SubjectWithRelations } from "./db/subject";
// @ts-ignore
import { default as greekKlitiki } from "greek-name-klitiki";
import { Transcript } from "./db/transcript";
import { formatDistanceToNow } from 'date-fns';
import { el } from 'date-fns/locale';

export const IS_DEV = process.env.NODE_ENV === 'development';

export const SUBJECT_POINT_COLOR = '#E57373'; // A nice red color that contrasts with the blue city polygons

export const UNKNOWN_SPEAKER_LABEL = "Άγνωστος Ομιλητής";

export const buildUnknownSpeakerLabel = (index: number) =>
  `${UNKNOWN_SPEAKER_LABEL} ${index}`;

export function subjectToMapFeature(subject: SubjectWithRelations) {
  if (!subject.location?.coordinates) return null;

  return {
    id: subject.id,
    geometry: {
      type: 'Point',
      coordinates: [subject.location.coordinates.y, subject.location.coordinates.x]
    },
    properties: {
      subjectId: subject.id,
      name: subject.name
    },
    style: {
      fillColor: SUBJECT_POINT_COLOR,
      fillOpacity: 0.6,
      strokeColor: SUBJECT_POINT_COLOR,
      strokeWidth: 6,
      label: subject.name
    }
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function klitiki(name: string): string {
  if (name.includes(" ")) {
    return name.split(" ").map(greekKlitiki).join(" ");
  }

  return greekKlitiki(name);
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

export function formatDate(date: Date): string {
  if (date instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function formatDateTime(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'long',
    timeStyle: 'short'
  };

  if (timezone) {
    options.timeZone = timezone;
  }

  if (date instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', options).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat('el-GR', options).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function formatDateRange(startDate: Date | null, endDate: Date | null, t: any): string {
  if (startDate && endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${formatDate(endDate)}`;
  }
  if (startDate && !endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${t('present')}`;
  }
  if (!startDate && endDate) {
    return `${t('until')} ${formatDate(endDate)}`;
  }
  return '';
}

export function sortSubjectsByImportance<T extends Subject & {
  topic?: Topic | null,
  statistics?: Statistics,
  // Make the type more flexible for different speaker segment structures
  speakerSegments?: any[]
}>(
  subjects: T[],
  orderBy: 'importance' | 'appearance' = 'importance'
) {
  return [...subjects].sort((a, b) => {
    // First priority: hot subjects (regardless of ordering mode)
    if (b.hot && !a.hot) return 1;
    if (a.hot && !b.hot) return -1;

    if (orderBy === 'importance') {
      // Second priority: speaking time from statistics
      if (a.statistics && b.statistics) {
        const timeComparison = b.statistics.speakingSeconds - a.statistics.speakingSeconds;
        // Add tie breaker for equal statistics
        if (timeComparison === 0) {
          // If agenda items exist, use them as first tie breaker
          if (a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
            return (a.agendaItemIndex ?? Infinity) - (b.agendaItemIndex ?? Infinity);
          }
          // If names exist, use alphabetical order as second tie breaker
          return a.name.localeCompare(b.name);
        }
        return timeComparison;
      }

      // Alternative for importance: number of speaker segments
      if (a.speakerSegments && b.speakerSegments) {
        const segmentComparison = b.speakerSegments.length - a.speakerSegments.length;
        // Add tie breaker for equal segment counts
        if (segmentComparison === 0) {
          // If agenda items exist, use them as first tie breaker
          if (a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
            return (a.agendaItemIndex ?? Infinity) - (b.agendaItemIndex ?? Infinity);
          }
          // If names exist, use alphabetical order as second tie breaker
          return a.name.localeCompare(b.name);
        }
        return segmentComparison;
      }

      // If no statistics or segments, use agenda item index
      if (a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
        return (a.agendaItemIndex ?? Infinity) - (b.agendaItemIndex ?? Infinity);
      }

      // Last resort: alphabetical sort by name
      return a.name.localeCompare(b.name);
    } else if (orderBy === 'appearance') {
      // For appearance order, we need a different approach based on data available

      // If we have full speaker segments with timestamps
      if (a.speakerSegments?.length && b.speakerSegments?.length) {
        // Try to extract timestamps if the structure has them
        const aHasTimestamps = a.speakerSegments.some(s =>
          s.startTimestamp || (s.speakerSegment && s.speakerSegment.startTimestamp));

        if (aHasTimestamps) {
          try {
            // Try to extract timestamps from various possible structures
            const aTimestamps = a.speakerSegments.map(s =>
              s.startTimestamp || (s.speakerSegment && s.speakerSegment.startTimestamp) || 0);
            const bTimestamps = b.speakerSegments.map(s =>
              s.startTimestamp || (s.speakerSegment && s.speakerSegment.startTimestamp) || 0);

            if (aTimestamps.length && bTimestamps.length) {
              const timestampComparison = Math.min(...aTimestamps) - Math.min(...bTimestamps);
              // If timestamps are equal, fall back to agenda item
              if (timestampComparison === 0) {
                // If agenda items exist, use them as tie breaker
                if (a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
                  return (a.agendaItemIndex ?? Infinity) - (b.agendaItemIndex ?? Infinity);
                }
                // Last resort: alphabetical sort by name
                return a.name.localeCompare(b.name);
              }
              return timestampComparison;
            }
          } catch (error) {
            // Fallback silently if timestamp extraction fails
            console.error("Error extracting timestamps:", error);
          }
        }
      }

      // Fallback to agenda item index for appearance order
      if (a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
        const indexComparison = (a.agendaItemIndex ?? Infinity) - (b.agendaItemIndex ?? Infinity);
        // If agenda items are equal, sort alphabetically by name
        if (indexComparison === 0) {
          return a.name.localeCompare(b.name);
        }
        return indexComparison;
      }

      // Last resort: alphabetical sort by name
      return a.name.localeCompare(b.name);
    }

    // Default fallback - alphabetical order
    return a.name.localeCompare(b.name);
  });
}

// Re-export calculateOfferTotals from the pricing module for backward compatibility
export { calculateOfferTotals } from './pricing'


export function joinTranscriptSegments(speakerSegments: Transcript): Transcript {
  if (speakerSegments.length === 0) {
    return speakerSegments;
  }

  const joinedSegments = [];
  let currentSegment = { ...speakerSegments[0] }; // Create a copy of the first segment

  for (let i = 1; i < speakerSegments.length; i++) {
    const nextSegment = speakerSegments[i];
    if (nextSegment.speakerTag.personId && currentSegment.speakerTag.personId
      && nextSegment.speakerTag.personId === currentSegment.speakerTag.personId
      && nextSegment.startTimestamp >= currentSegment.startTimestamp) {
      // Join adjacent segments with the same speaker
      currentSegment = {
        ...currentSegment,
        summary: currentSegment.summary || nextSegment.summary ? {
          id: currentSegment.summary?.id || nextSegment.summary?.id || '',
          createdAt: currentSegment.summary?.createdAt || nextSegment.summary?.createdAt || new Date(),
          updatedAt: currentSegment.summary?.updatedAt || nextSegment.summary?.updatedAt || new Date(),
          speakerSegmentId: currentSegment.summary?.speakerSegmentId || nextSegment.summary?.speakerSegmentId || currentSegment.id,
          text: [currentSegment.summary?.text, nextSegment.summary?.text].filter(Boolean).join(" || ") || '',
          type: currentSegment.summary?.type === 'substantive' || nextSegment.summary?.type === 'substantive' ? 'substantive' : 'procedural'
        } : null,
        endTimestamp: Math.max(currentSegment.endTimestamp, nextSegment.endTimestamp),
        utterances: [...currentSegment.utterances, ...nextSegment.utterances],
        topicLabels: [...currentSegment.topicLabels, ...nextSegment.topicLabels]
      };
    } else {
      // Push the current segment and start a new one
      joinedSegments.push(currentSegment);
      currentSegment = { ...nextSegment };
    }
  }

  // Push the last segment
  joinedSegments.push(currentSegment);

  return joinedSegments;
}




export function filterActiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(isRoleActive);
}

export function filterInactiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(role => !isRoleActive(role));
}

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

export function isRoleActive(role: { startDate: Date | null, endDate: Date | null }): boolean {
  const now = new Date();
  return isRoleActiveAt(role, now);
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

export function getNonPartyRoles(roles: (Role & { party?: Party | null })[], date?: Date, administrativeBodyId?: string): Role[] {
  const checkDate = date || new Date();
  let filteredRoles = roles.filter(role => !role.partyId).filter(role => isRoleActiveAt(role, checkDate));
  if (administrativeBodyId) {
    filteredRoles = filteredRoles.filter(role => role.administrativeBodyId && role.administrativeBodyId === administrativeBodyId);
  }
  return filteredRoles;
}

export function getSingleCityRole(roles: (Role & { cityId?: string | null })[], date?: Date, administrativeBodyId?: string): Role | null {
  const checkDate = date || new Date();
  const filteredRoles = getNonPartyRoles(roles, checkDate, administrativeBodyId);
  const cityRoles = filteredRoles.filter(role => role.cityId);
  return cityRoles.length > 0 ? cityRoles[0] : null;
}

export function normalizeText(text: string): string {
  if (!text) return '';

  // Convert to lowercase first
  text = text.toLowerCase();

  // Remove diacritics (τόνοι)
  return text.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .replace(/ά/g, 'α')
    .replace(/έ/g, 'ε')
    .replace(/ή/g, 'η')
    .replace(/ί/g, 'ι')
    .replace(/ό/g, 'ο')
    .replace(/ύ/g, 'υ')
    .replace(/ώ/g, 'ω')
    .replace(/ϊ/g, 'ι')
    .replace(/ϋ/g, 'υ')
    .replace(/ΐ/g, 'ι')
    .replace(/ΰ/g, 'υ');
}

export function getMeetingState(meeting: {
  videoUrl?: string | null;
  audioUrl?: string | null;
  muxPlaybackId?: string | null;
  agendaUrl?: string | null;
  subjects?: any[];
}): { label: string; icon: string } {
  // Video state - if there's a video and mux playback id
  if (meeting.videoUrl && meeting.muxPlaybackId && !meeting.videoUrl.endsWith('mp3')) {
    return {
      label: "Bίντεο",
      icon: "video"
    };
  }

  // Audio state - if there's audio and mux playback id
  if (meeting.audioUrl && meeting.muxPlaybackId) {
    return {
      label: "Ήχος",
      icon: "audio"
    };
  }

  // Agenda state - if there's an agenda and at least one subject but no media
  if (meeting.agendaUrl && meeting.subjects && meeting.subjects.length > 0 && !meeting.muxPlaybackId) {
    return {
      label: "Διάταξη",
      icon: "fileText"
    };
  }

  // Empty state - default case
  return {
    label: "Κενή",
    icon: "ban"
  };
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

type GeometryBounds = {
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number } | null;
  center: [number, number];
};

/**
 * Calculates bounds and center from a GeoJSON geometry
 * @param geometry The GeoJSON geometry to process
 */
export function calculateGeometryBounds(geometry: any): GeometryBounds {
  const DEFAULT_RETURN: GeometryBounds = {
    bounds: null,
    center: [23.7275, 37.9838] // Default to Athens
  };

  if (!geometry) {
    console.log('[Location] No geometry available, using default coordinates');
    return DEFAULT_RETURN;
  }

  try {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    // Check for supported geometry types
    if (!['Point', 'Polygon', 'MultiPolygon'].includes(geometry.type)) {
      console.warn(`[Location] Unsupported geometry type: ${geometry.type}, using default coordinates`);
      return DEFAULT_RETURN;
    }

    const processCoordinates = (coords: number[][]) => {
      coords.forEach(point => {
        const [lng, lat] = point;
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
    };

    if (geometry.type === 'Polygon') {
      processCoordinates(geometry.coordinates[0]);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon: number[][][]) => {
        processCoordinates(polygon[0]);
      });
    } else if (geometry.type === 'Point') {
      const [lng, lat] = geometry.coordinates;
      minLng = maxLng = lng;
      minLat = maxLat = lat;
    }

    const bounds = {
      minLng,
      maxLng,
      minLat,
      maxLat
    };

    const center: [number, number] = [
      (minLng + maxLng) / 2,
      (minLat + maxLat) / 2
    ];

    return { bounds, center };
  } catch (error) {
    console.error('[Location] Error calculating geometry bounds:', error);
    return DEFAULT_RETURN;
  }
}

/**
 * Formats time in seconds to a human-readable string
 * @param time - Time in seconds
 * @returns Formatted string like "5:30" or "1:23:45"
 */
export function formatTime(time: number): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats a date to a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to 'el')
 * @returns Formatted relative time string in the specified locale
 */
export function formatRelativeTime(date: Date, locale: string = 'el'): string {
  // Map locale to date-fns locale
  const dateFnsLocale = locale === 'en' ? undefined : el;
  
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: dateFnsLocale
  });
}
