/**
 * OpenCouncil Pricing Module
 * 
 * This module provides the single source of truth for all pricing-related
 * functionality in the OpenCouncil application.
 */

// Export all configuration
export * from './config';

// Export all calculation functions and types
export * from './calculations';

// Re-export commonly used functions for convenience
export {
    calculateOfferTotals,
    estimateYearlyPricing,
    getPlatformMonthlyPrice,
    getSessionProcessingPrice,
    getCurrentCorrectnessGuaranteePrice
} from './calculations';

export {
    getPlatformPricingTier,
    getCorrectnessPricing,
    getCurrentCorrectnessPricing,
    PLATFORM_PRICING_TIERS,
    SESSION_PROCESSING,
    CORRECTNESS_GUARANTEE_PRICING,
    CURRENT_OFFER_VERSION,
    PRICING_CONSTANTS
} from './config'; 