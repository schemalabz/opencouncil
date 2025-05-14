import { Offer, Subject, Topic } from "@prisma/client";
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Statistics } from "./statistics";
import { SubjectWithRelations } from "./db/subject";
// @ts-ignore
import { default as greekKlitiki } from "greek-name-klitiki";
import { Transcript } from "./db/transcript";

export const SUBJECT_POINT_COLOR = '#E57373'; // A nice red color that contrasts with the blue city polygons

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

export const calculateOfferTotals = (offer: Offer): {
  months: number,
  platformTotal: number,
  ingestionTotal: number,
  subtotal: number,
  discount: number,
  total: number,
  hoursToGuarantee: number,
  correctnessGuaranteeCost: number,
  paymentPlan: { dueDate: Date, amount: number }[]
} => {
  const months = monthsBetween(offer.startDate, offer.endDate)
  const platformTotal = offer.platformPrice * months
  const ingestionTotal = offer.ingestionPerHourPrice * offer.hoursToIngest

  // Calculate correctness guarantee cost based on version
  let correctnessGuaranteeCost = 0
  let hoursToGuarantee = 0

  if (offer.correctnessGuarantee) {
    if (offer.version === 3) {
      // Version 3: Price per hour
      hoursToGuarantee = offer.hoursToGuarantee || 0
      correctnessGuaranteeCost = hoursToGuarantee * 11 // 11 EUR per hour
    } else if (offer.version === 2) {
      // Version 2: Price per hour
      hoursToGuarantee = offer.hoursToGuarantee || 0
      correctnessGuaranteeCost = hoursToGuarantee * 20 // 20 EUR per hour
    } else {
      // Version 1: Price per meeting
      const meetingsToIngest = offer.meetingsToIngest || 0
      correctnessGuaranteeCost = meetingsToIngest * 80 // 80 EUR per meeting
      hoursToGuarantee = meetingsToIngest // For display purposes
    }
  }

  const subtotal = platformTotal + ingestionTotal + correctnessGuaranteeCost
  const discount = subtotal * (offer.discountPercentage / 100)
  const total = subtotal - discount

  // Calculate payment dates
  const startDate = new Date(offer.startDate)
  const endDate = new Date(offer.endDate)
  const midPoint = new Date((startDate.getTime() + endDate.getTime()) / 2)

  // First payment date: Find Friday before midPoint - 15 days
  const firstPaymentDate = new Date(midPoint)
  firstPaymentDate.setDate(firstPaymentDate.getDate() - 15)
  while (firstPaymentDate.getDay() !== 5) { // 5 = Friday
    firstPaymentDate.setDate(firstPaymentDate.getDate() - 1)
  }

  // Second payment date: Find Friday before endDate - 15 days
  const secondPaymentDate = new Date(endDate)
  secondPaymentDate.setDate(secondPaymentDate.getDate() - 15)
  while (secondPaymentDate.getDay() !== 5) {
    secondPaymentDate.setDate(secondPaymentDate.getDate() - 1)
  }

  const paymentPlan = [
    {
      dueDate: firstPaymentDate,
      amount: total / 2
    },
    {
      dueDate: secondPaymentDate,
      amount: total / 2
    }
  ]

  return {
    months,
    platformTotal,
    ingestionTotal,
    subtotal,
    discount,
    total,
    hoursToGuarantee,
    correctnessGuaranteeCost,
    paymentPlan
  }
}


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


export function isRoleActive(role: { startDate: Date | null, endDate: Date | null }): boolean {
  const now = new Date();

  // Both dates null = active
  if (!role.startDate && !role.endDate) return true;

  // Only start date set - active if in past
  if (role.startDate && !role.endDate) {
    return role.startDate <= now;
  }

  // Only end date set - active if in future
  if (!role.startDate && role.endDate) {
    return role.endDate > now;
  }

  // Both dates set - active if current time is within range
  if (role.startDate && role.endDate) {
    return role.startDate <= now && role.endDate > now;
  }

  return false;
}


export function filterActiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(isRoleActive);
}

export function filterInactiveRoles<T extends { startDate: Date | null, endDate: Date | null }>(roles: T[]): T[] {
  return roles.filter(role => !isRoleActive(role));
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
  console.log(meeting.videoUrl);
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
 * If in a subdomain context, it keeps the URL in the subdomain
 * Otherwise it uses the path-based navigation
 * 
 * @param cityId The ID of the city
 * @param path Additional path after the city ID
 * @param locale The locale to use for the URL
 * @returns A URL string for navigation
 */
export function buildCityUrl(cityId: string, path: string = '', locale: string = 'el'): string {
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';
  const enableSubdomains = process.env.NEXT_PUBLIC_ENABLE_SUBDOMAINS === 'true';

  // If subdomains are disabled, always use path-based routing
  if (!enableSubdomains) {
    return `/${locale}/${cityId}${path ? `/${path}` : ''}`;
  }

  // Check if we're in browser and if so, check for subdomain
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isSubdomain = hostname.includes(`.${mainDomain}`) && !hostname.startsWith('www');

    // Get the current subdomain if on a city site
    const currentSubdomain = isSubdomain ? hostname.split('.')[0] : null;

    // If we're on a city subdomain and it matches the requested city
    if (currentSubdomain && currentSubdomain === cityId) {
      // Keep navigation within the subdomain
      return path ? `/${path}` : '/';
    }

    // If navigating to a different city from a subdomain
    if (isSubdomain && currentSubdomain !== cityId) {
      // Generate URL for the new city's subdomain
      return `https://${cityId}.${mainDomain}${path ? `/${path}` : ''}`;
    }

    // If on main domain, use subdomain URL for the city
    if (hostname === mainDomain || hostname === `www.${mainDomain}`) {
      return `https://${cityId}.${mainDomain}${path ? `/${path}` : ''}`;
    }
  }

  // Fallback to path-based URL structure (for SSR or if subdomain logic doesn't apply)
  return `/${locale}/${cityId}${path ? `/${path}` : ''}`;
}
