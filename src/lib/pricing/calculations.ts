/**
 * OpenCouncil Pricing Calculations
 * 
 * All pricing calculation functions that use the centralized pricing configuration.
 * These functions should be used for offers, pricing displays, and estimates.
 */

import { Offer } from '@prisma/client';
import {
    getPlatformPricingTier,
    getCorrectnessPricing,
    SESSION_PROCESSING,
    PHYSICAL_PRESENCE,
    PRICING_CONSTANTS,
    CURRENT_OFFER_VERSION
} from './config';
import { monthsBetween } from '../utils';

export interface OfferTotals {
    months: number;
    platformTotal: number;
    ingestionTotal: number;
    equipmentRentalTotal: number;
    physicalPresenceTotal: number;
    subtotal: number;
    discount: number;
    total: number;
    hoursToGuarantee: number;
    correctnessGuaranteeCost: number;
    paymentPlan: { dueDate: Date; amount: number }[];
}

export interface PricingEstimate {
    yearlyPlatformCost: number;
    yearlySessionCost: number;
    yearlyCorrectnessCost: number;
    totalYearlyCost: number;
}

/**
 * Calculate comprehensive offer totals including payment plan
 */
export function calculateOfferTotals(offer: Offer): OfferTotals {
    const months = monthsBetween(offer.startDate, offer.endDate);
    const platformTotal = offer.platformPrice * months;
    const ingestionTotal = offer.ingestionPerHourPrice * offer.hoursToIngest;

    // Calculate equipment rental cost
    const equipmentRentalTotal = ((offer as any).equipmentRentalPrice || 0) * months;

    // Calculate physical presence cost
    const physicalPresenceTotal = ((offer as any).physicalPresenceHours || 0) * PHYSICAL_PRESENCE.pricePerHour;

    // Calculate correctness guarantee cost based on version
    let correctnessGuaranteeCost = 0;
    let hoursToGuarantee = 0;

    if (offer.correctnessGuarantee) {
        const offerVersion = offer.version || 1; // Default to version 1 for legacy offers
        const correctnessPricing = getCorrectnessPricing(offerVersion);

        if (correctnessPricing.unit === 'hour') {
            hoursToGuarantee = offer.hoursToGuarantee || 0;
            correctnessGuaranteeCost = hoursToGuarantee * correctnessPricing.pricePerUnit;
        } else {
            // Legacy version 1 - price per meeting
            const meetingsToIngest = offer.meetingsToIngest || 0;
            correctnessGuaranteeCost = meetingsToIngest * correctnessPricing.pricePerUnit;
            hoursToGuarantee = meetingsToIngest; // For display purposes
        }
    }

    const subtotal = platformTotal + ingestionTotal + equipmentRentalTotal + physicalPresenceTotal + correctnessGuaranteeCost;
    const discount = subtotal * (offer.discountPercentage / 100);
    const total = subtotal - discount;

    // Calculate payment plan
    const paymentPlan = calculatePaymentPlan(offer.startDate, offer.endDate, total);

    return {
        months,
        platformTotal,
        ingestionTotal,
        equipmentRentalTotal,
        physicalPresenceTotal,
        subtotal,
        discount,
        total,
        hoursToGuarantee,
        correctnessGuaranteeCost,
        paymentPlan
    };
}

/**
 * Calculate payment plan with due dates on Fridays
 */
function calculatePaymentPlan(startDate: Date, endDate: Date, totalAmount: number): { dueDate: Date; amount: number }[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const midPoint = new Date((start.getTime() + end.getTime()) / 2);

    // First payment date: Find Friday before midPoint - bufferDays
    const firstPaymentDate = new Date(midPoint);
    firstPaymentDate.setDate(firstPaymentDate.getDate() - PRICING_CONSTANTS.paymentBufferDays);
    while (firstPaymentDate.getDay() !== 5) { // 5 = Friday
        firstPaymentDate.setDate(firstPaymentDate.getDate() - 1);
    }

    // Second payment date: Find Friday before endDate - bufferDays
    const secondPaymentDate = new Date(end);
    secondPaymentDate.setDate(secondPaymentDate.getDate() - PRICING_CONSTANTS.paymentBufferDays);
    while (secondPaymentDate.getDay() !== 5) {
        secondPaymentDate.setDate(secondPaymentDate.getDate() - 1);
    }

    const paymentAmount = totalAmount / PRICING_CONSTANTS.paymentSplits;

    return [
        {
            dueDate: firstPaymentDate,
            amount: paymentAmount
        },
        {
            dueDate: secondPaymentDate,
            amount: paymentAmount
        }
    ];
}

/**
 * Estimate yearly pricing based on parameters
 */
export function estimateYearlyPricing(
    population: number,
    councilMeetingsPerYear: number,
    averageHoursPerMeeting: number,
    includeCorrectnessGuarantee: boolean = false
): PricingEstimate {
    const platformTier = getPlatformPricingTier(population);
    const yearlyPlatformCost = platformTier.monthlyPrice * 12;

    const totalYearlyHours = councilMeetingsPerYear * averageHoursPerMeeting;
    const yearlySessionCost = totalYearlyHours * SESSION_PROCESSING.pricePerHour;

    let yearlyCorrectnessCost = 0;
    if (includeCorrectnessGuarantee) {
        const currentCorrectnessPricing = getCorrectnessPricing(CURRENT_OFFER_VERSION);
        if (currentCorrectnessPricing.unit === 'hour') {
            yearlyCorrectnessCost = totalYearlyHours * currentCorrectnessPricing.pricePerUnit;
        } else {
            // Legacy support for meeting-based pricing
            yearlyCorrectnessCost = councilMeetingsPerYear * currentCorrectnessPricing.pricePerUnit;
        }
    }

    const totalYearlyCost = yearlyPlatformCost + yearlySessionCost + yearlyCorrectnessCost;

    return {
        yearlyPlatformCost,
        yearlySessionCost,
        yearlyCorrectnessCost,
        totalYearlyCost
    };
}

/**
 * Get platform monthly price for a given population
 */
export function getPlatformMonthlyPrice(population: number): number {
    return getPlatformPricingTier(population).monthlyPrice;
}

/**
 * Get current session processing price per hour
 */
export function getSessionProcessingPrice(): number {
    return SESSION_PROCESSING.pricePerHour;
}

/**
 * Get current correctness guarantee price info
 */
export function getCurrentCorrectnessGuaranteePrice(): { price: number; unit: string; description: string } {
    const pricing = getCorrectnessPricing(CURRENT_OFFER_VERSION);
    return {
        price: pricing.pricePerUnit,
        unit: pricing.unit,
        description: pricing.description
    };
}

/**
 * Get combined session processing and correctness guarantee price per hour
 * This represents the default offering which includes human transcription correction
 */
export function getCombinedProcessingPrice(): {
    pricePerHour: number;
    sessionPrice: number;
    correctnessPrice: number;
    label: string;
    description: string;
} {
    const sessionPrice = SESSION_PROCESSING.pricePerHour;
    const correctnessPrice = getCorrectnessPricing(CURRENT_OFFER_VERSION).pricePerUnit;

    return {
        pricePerHour: sessionPrice + correctnessPrice,
        sessionPrice,
        correctnessPrice,
        label: "Εισαγωγή συνεδρίασης",
        description: "Συμπεριλαμβάνει ψηφιοποίηση και διόρθωση απομαγνητοφώνησης από άνθρωπο"
    };
} 