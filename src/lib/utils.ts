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
  console.log(`formatDate: ${date}`);
  if (date instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function sortSubjectsByImportance<T extends Subject & { topic?: Topic | null, statistics?: Statistics }>(subjects: T[]) {
  return [...subjects].sort((a, b) => {
    // First priority: hot subjects
    if (b.hot && !a.hot) return 1;
    if (a.hot && !b.hot) return -1;

    // Second priority: speaking time
    if (a.statistics && b.statistics) {
      return b.statistics.speakingSeconds - a.statistics.speakingSeconds;
    }

    return 0;
  });
}

export const calculateOfferTotals = (offer: Offer): {
  months: number,
  platformTotal: number,
  ingestionTotal: number,
  subtotal: number,
  discount: number,
  total: number,
  meetingsToIngest: number,
  correctnessGuaranteeCost: number,
  paymentPlan: { dueDate: Date, amount: number }[]
} => {
  const months = monthsBetween(offer.startDate, offer.endDate)
  const platformTotal = offer.platformPrice * months
  const ingestionTotal = offer.ingestionPerHourPrice * offer.hoursToIngest
  const correctnessGuaranteeCost = offer.correctnessGuarantee && offer.meetingsToIngest ? offer.meetingsToIngest * 80 : 0
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
    meetingsToIngest: offer.meetingsToIngest || 0,
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
