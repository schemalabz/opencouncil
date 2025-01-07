import { Offer, Subject, Topic } from "@prisma/client";
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Statistics } from "./statistics";
import { SubjectWithRelations } from "./db/subject";
// @ts-ignore
import { default as greekKlitiki } from "greek-name-klitiki";

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