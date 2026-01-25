import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Statistics } from "./statistics";
import { SubjectWithRelations } from "./db/subject";
// @ts-ignore
import { default as greekKlitiki } from "greek-name-klitiki";
import { Transcript } from "./db/transcript";
import { VideoIcon, AudioLines, FileText, Ban, LucideIcon } from "lucide-react";

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

// Removed time formatting functions as they are now re-exported from src/lib/formatters/time.ts

/**
 * Minimal interface for subjects that can be sorted by importance.
 * Only declares the fields actually used by the sorting logic.
 * Any type matching this structure can be sorted.
 */
interface SortableSubject {
  name: string;
  hot: boolean;
  // Optional fields used for advanced sorting
  statistics?: Statistics;
  speakerSegments?: any[];
  agendaItemIndex?: number | null;
}

export function sortSubjectsByImportance<T extends SortableSubject>(
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

/**
 * Get media type information for a meeting
 * Returns the type of media available with label and icon component
 */
export function getMeetingMediaType(meeting: {
  videoUrl?: string | null;
  audioUrl?: string | null;
  muxPlaybackId?: string | null;
  agendaUrl?: string | null;
  subjects?: any[];
}): { label: string; icon: LucideIcon } {
  // Video state - if there's a video and mux playback id
  if (meeting.videoUrl && meeting.muxPlaybackId && !meeting.videoUrl.endsWith('mp3')) {
    return {
      label: "Bίντεο",
      icon: VideoIcon
    };
  }

  // Audio state - if there's audio and mux playback id
  if (meeting.audioUrl && meeting.muxPlaybackId) {
    return {
      label: "Ήχος",
      icon: AudioLines
    };
  }

  // Agenda state - if there's an agenda and at least one subject but no media
  if (meeting.agendaUrl && meeting.subjects && meeting.subjects.length > 0 && !meeting.muxPlaybackId) {
    return {
      label: "Διάταξη",
      icon: FileText
    };
  }

  // Empty state - default case
  return {
    label: "Κενή",
    icon: Ban
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
