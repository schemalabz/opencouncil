/**
 * OpenCouncil Pricing Configuration
 * 
 * This is the single source of truth for all pricing-related information.
 * All pricing calculations, displays, and forms should reference this file.
 * 
 * IMPORTANT: Changing these values affects new offers only. Existing offers
 * use their stored values to ensure contract stability.
 */

export interface PlatformPricingTier {
    readonly maxPopulation: number | null; // null means no upper limit
    readonly monthlyPrice: number; // in EUR
    readonly label: string;
    readonly labelEn: string;
}

export interface CorrectnessPricingVersion {
    readonly version: number;
    readonly pricePerUnit: number; // in EUR
    readonly unit: 'meeting' | 'hour';
    readonly description: string;
}

/**
 * Platform pricing tiers based on municipality population
 */
export const PLATFORM_PRICING_TIERS: readonly PlatformPricingTier[] = [
    {
        maxPopulation: 2000,
        monthlyPrice: 0,
        label: "Έως 2.000 κάτοικοι",
        labelEn: "Up to 2,000 residents"
    },
    {
        maxPopulation: 10000,
        monthlyPrice: 300,
        label: "2.001 - 10.000 κάτοικοι",
        labelEn: "2,001 - 10,000 residents"
    },
    {
        maxPopulation: 30000,
        monthlyPrice: 600,
        label: "10.001 - 30.000 κάτοικοι",
        labelEn: "10,001 - 30,000 residents"
    },
    {
        maxPopulation: 50000,
        monthlyPrice: 900,
        label: "30.001 - 50.000 κάτοικοι",
        labelEn: "30,001 - 50,000 residents"
    },
    {
        maxPopulation: 100000,
        monthlyPrice: 1500,
        label: "50.001 - 100.000 κάτοικοι",
        labelEn: "50,001 - 100,000 residents"
    },
    {
        maxPopulation: null,
        monthlyPrice: 2000,
        label: "100.001+ κάτοικοι",
        labelEn: "100,001+ residents"
    }
] as const;

/**
 * Session processing pricing
 */
export const SESSION_PROCESSING = {
    /** Price per hour of meeting processing in EUR */
    pricePerHour: 9,
    label: "Ψηφιοποίηση συνεδρίασης",
    labelEn: "Meeting digitization",
    description: "Κοινή τιμολόγηση ανεξαρτήτως μεγέθους δήμου",
    descriptionEn: "Flat rate regardless of municipality size"
} as const;

/**
 * Physical presence pricing
 */
export const PHYSICAL_PRESENCE = {
    /** Price per hour for personnel presence in meetings in EUR */
    pricePerHour: 25,
    label: "Φυσική παρουσία σε συνεδριάσεις",
    labelEn: "Physical presence in meetings",
    description: "Παρουσία προσωπικού στις συνεδριάσεις του δημοτικού συμβουλίου",
    descriptionEn: "Personnel presence at city council meetings"
} as const;

/**
 * Equipment rental pricing
 */
export const EQUIPMENT_RENTAL = {
    label: "Κάμερες, μικρόφωνα και εξοπλισμός συνεδριάσεων",
    labelEn: "Cameras, microphones and conferencing equipment",
    description: "Μηνιαία τιμολόγηση βάσει συγκεκριμένων αναγκών του δήμου",
    descriptionEn: "Monthly pricing based on specific municipality needs"
} as const;

/**
 * Correctness guarantee pricing by offer version
 * Newer versions should have higher version numbers
 */
export const CORRECTNESS_GUARANTEE_PRICING: readonly CorrectnessPricingVersion[] = [
    {
        version: 1,
        pricePerUnit: 80,
        unit: 'meeting',
        description: "Έλεγχος απομαγνητοφωνήσεων από άνθρωπο (ανά συνεδρίαση)"
    },
    {
        version: 2,
        pricePerUnit: 20,
        unit: 'hour',
        description: "Έλεγχος απομαγνητοφωνήσεων από άνθρωπο (ανά ώρα)"
    },
    {
        version: 3,
        pricePerUnit: 11,
        unit: 'hour',
        description: "Έλεγχος απομαγνητοφωνήσεων από άνθρωπο (ανά ώρα)"
    }
] as const;

/**
 * Current pricing version for new offers
 */
export const CURRENT_OFFER_VERSION = 3 as const;

/**
 * Additional pricing constants
 */
export const PRICING_CONSTANTS = {
    /** Currency code */
    currency: 'EUR',
    /** Default payment plan splits */
    paymentSplits: 2,
    /** Days before period midpoint/end for payment due dates */
    paymentBufferDays: 15
} as const;

/**
 * Get platform pricing tier for a given population
 */
export function getPlatformPricingTier(population: number): PlatformPricingTier {
    const tier = PLATFORM_PRICING_TIERS.find(tier =>
        tier.maxPopulation === null || population <= tier.maxPopulation
    );

    if (!tier) {
        throw new Error(`No pricing tier found for population: ${population}`);
    }

    return tier;
}

/**
 * Get correctness guarantee pricing for a specific version
 */
export function getCorrectnessPricing(version: number): CorrectnessPricingVersion {
    const pricing = CORRECTNESS_GUARANTEE_PRICING.find(p => p.version === version);

    if (!pricing) {
        throw new Error(`No correctness guarantee pricing found for version: ${version}`);
    }

    return pricing;
}

/**
 * Get the current correctness guarantee pricing (latest version)
 */
export function getCurrentCorrectnessPricing(): CorrectnessPricingVersion {
    return getCorrectnessPricing(CURRENT_OFFER_VERSION);
} 