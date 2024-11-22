import { Offer } from "@prisma/client";
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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
  const diffMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30));
  return diffMonths;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(date);
}

export const calculateOfferTotals = (offer: Offer) => {
  const months = monthsBetween(offer.startDate, offer.endDate)
  const platformTotal = offer.platformPrice * months
  const ingestionTotal = offer.ingestionPerHourPrice * offer.hoursToIngest
  const subtotal = platformTotal + ingestionTotal
  const discount = subtotal * (offer.discountPercentage / 100)
  const total = subtotal - discount

  return {
    months,
    platformTotal,
    ingestionTotal,
    subtotal,
    discount,
    total
  }
}