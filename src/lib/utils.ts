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
  simplifyRoleName,
  getActiveRoleCondition,
  getRoleNameForPerson,
  getSpeakerDisplayInfo,
  sortRolesByPriority,
  getRoleTypePriority,
  getPrimaryRole
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
  const normalizedName = name.trim();
  if (!normalizedName) {
    return "";
  }

  const decline = (s: string): string => {
    if (!s) return "";
    // If the segment contains spaces (e.g. after splitting by hyphen), decline each word individually
    if (/\s/.test(s)) {
      return s.split(/\s+/).map(decline).join(" ");
    }
    // Normalize to Title Case for the library
    const capitalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return greekKlitiki(capitalized);
  };

  if (normalizedName.includes("-")) {
    return normalizedName.split("-").map(decline).join("-");
  }

  if (/\s/.test(normalizedName)) {
    return normalizedName.split(/\s+/).map(decline).join(" ");
  }

  return decline(normalizedName);
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
  // Optional fields used for advanced sorting
  statistics?: Statistics;
  speakerSegments?: unknown[];
  agendaItemIndex?: number | null;
  nonAgendaReason?: string | null;
  _count?: { contributions?: number };
}

export function sortSubjectsByImportance<T extends SortableSubject>(
  subjects: T[],
  orderBy: 'importance' | 'appearance' = 'importance'
) {
  return [...subjects].sort((a, b) => {
    if (orderBy === 'importance') {
      // 1. Agenda status: beforeAgenda sorts last;
      //    outOfAgenda and regular agenda items are treated equally
      const aIsBeforeAgenda = a.nonAgendaReason === 'beforeAgenda' ? 1 : 0;
      const bIsBeforeAgenda = b.nonAgendaReason === 'beforeAgenda' ? 1 : 0;
      if (aIsBeforeAgenda !== bIsBeforeAgenda) return aIsBeforeAgenda - bIsBeforeAgenda;

      // 2. Number of speaker contributions (descending)
      const aContributions = a._count?.contributions ?? 0;
      const bContributions = b._count?.contributions ?? 0;
      if (aContributions !== bContributions) return bContributions - aContributions;

      // 3. Agenda item index (ascending), non-agenda items sort after agenda items
      const aIndex = a.agendaItemIndex ?? Infinity;
      const bIndex = b.agendaItemIndex ?? Infinity;
      if (aIndex !== bIndex) return aIndex - bIndex;

      // Final tie-breaker: alphabetical by name
      return a.name.localeCompare(b.name);
    } else if (orderBy === 'appearance') {
      // For appearance order, use speaker segment timestamps

      if (a.speakerSegments?.length && b.speakerSegments?.length) {
        const getTimestamp = (s: Record<string, unknown>) =>
          (s.startTimestamp as number) || ((s.speakerSegment as Record<string, unknown>)?.startTimestamp as number) || 0;
        const aHasTimestamps = a.speakerSegments.some(s => getTimestamp(s as Record<string, unknown>));

        if (aHasTimestamps) {
          const aMin = Math.min(...a.speakerSegments.map(s => getTimestamp(s as Record<string, unknown>)));
          const bMin = Math.min(...b.speakerSegments.map(s => getTimestamp(s as Record<string, unknown>)));
          if (aMin !== bMin) return aMin - bMin;
        }
      }

      // Fallback to agenda item index
      const aIndex = a.agendaItemIndex ?? Infinity;
      const bIndex = b.agendaItemIndex ?? Infinity;
      if (aIndex !== bIndex) return aIndex - bIndex;

      return a.name.localeCompare(b.name);
    }

    return a.name.localeCompare(b.name);
  });
}

export function sortSubjectsBySpeakingTime<T extends SortableSubject>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) => {
    const aSeconds = a.statistics?.speakingSeconds ?? 0;
    const bSeconds = b.statistics?.speakingSeconds ?? 0;
    if (bSeconds !== aSeconds) return bSeconds - aSeconds;
    return a.name.localeCompare(b.name);
  });
}

export function sortSubjectsByAgendaIndex<T extends SortableSubject>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) => {
    const aIndex = a.agendaItemIndex ?? Infinity;
    const bIndex = b.agendaItemIndex ?? Infinity;
    if (aIndex !== bIndex) return aIndex - bIndex;
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