# OpenCouncil Pricing System Documentation

## Overview

The OpenCouncil pricing system is a centralized, type-safe configuration that defines all pricing rules and calculations for the platform. This system ensures consistency across offer generation, pricing displays, and calculations while maintaining backward compatibility with existing offers.

## Architecture

### Single Source of Truth

All pricing-related logic is centralized in the `/src/lib/pricing/` module:

```
src/lib/pricing/
├── config.ts          # Pricing configuration and constants
├── calculations.ts     # Pricing calculation functions
└── index.ts           # Public API exports
```

### Key Principles

1. **Immutability**: All pricing configurations are readonly to prevent accidental modifications
2. **Versioning**: Offer versioning ensures existing contracts remain stable
3. **Type Safety**: TypeScript interfaces enforce correct pricing structure
4. **Centralization**: All pricing logic references the same configuration

## Pricing Components

### 1. Platform Pricing Tiers

Population-based monthly subscription fees:

```typescript
export const PLATFORM_PRICING_TIERS: readonly PlatformPricingTier[] = [
  {
    maxPopulation: 2000,
    monthlyPrice: 0,
    label: "Έως 2.000 κάτοικοι",
    labelEn: "Up to 2,000 residents"
  },
  // ... more tiers
]
```

**Current Tiers:**
- **0-2,000 residents**: Free
- **2,001-10,000**: €200/month
- **10,001-30,000**: €400/month
- **30,001-50,000**: €600/month
- **50,001-100,000**: €1,200/month
- **100,001+**: €2,000/month

### 2. Session Processing

Flat-rate pricing for meeting digitization:

```typescript
export const SESSION_PROCESSING = {
  pricePerHour: 9, // EUR per hour
  label: "Ψηφιοποίηση συνεδρίασης",
  description: "Κοινή τιμολόγηση ανεξαρτήτως μεγέθους δήμου"
} as const;
```

### 3. Physical Presence

Hourly pricing for personnel presence at council meetings:

```typescript
export const PHYSICAL_PRESENCE = {
  pricePerHour: 25, // EUR per hour
  label: "Φυσική παρουσία σε συνεδριάσεις",
  description: "Παρουσία προσωπικού στις συνεδριάσεις του δημοτικού συμβουλίου"
} as const;
```

### 4. Equipment Rental

Customizable monthly pricing for conferencing equipment:

```typescript
export const EQUIPMENT_RENTAL = {
  label: "Κάμερες, μικρόφωνα και εξοπλισμός συνεδριάσεων",
  description: "Μηνιαία τιμολόγηση βάσει συγκεκριμένων αναγκών του δήμου"
} as const;
```

Equipment rental pricing is configurable per offer and includes:
- Monthly rental price (customizable based on municipality needs)
- Equipment name/title (e.g., "Professional Video & Audio Package")
- Detailed description of included equipment

### 5. Correctness Guarantee

Version-based pricing for human transcription verification:

```typescript
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
]
```

## Offer Versioning

### Why Versioning?

**CRITICAL**: Existing offers must never change their calculated totals, as they represent legal contracts with municipalities. Versioning ensures:

1. **Contract Stability**: Sent offers maintain their original pricing
2. **Pricing Evolution**: New offers can use updated pricing
3. **Backward Compatibility**: Legacy offers continue to work correctly

### Version History

- **Version 1** (Legacy): Correctness guarantee priced per meeting (€80/meeting)
- **Version 2**: Correctness guarantee priced per hour (€20/hour)
- **Version 3** (Current): Reduced correctness guarantee pricing (€11/hour)

### Current Version

The current version for new offers is defined in:

```typescript
export const CURRENT_OFFER_VERSION = 3 as const;
```

## Usage

### Basic Pricing Calculation

```typescript
import { calculateOfferTotals } from '@/lib/pricing';

const offer: Offer = {
  // ... offer properties
  version: 3,
  platformPrice: 600,
  ingestionPerHourPrice: 9,
  hoursToIngest: 20,
  correctnessGuarantee: true,
  hoursToGuarantee: 15,
  equipmentRentalPrice: 150, // Monthly equipment rental
  physicalPresenceHours: 8,  // Personnel hours
  discountPercentage: 10
};

const totals = calculateOfferTotals(offer);
console.log(totals.total); // Final price
```

### Yearly Pricing Estimation

```typescript
import { estimateYearlyPricing } from '@/lib/pricing';

const estimate = estimateYearlyPricing(
  50000, // population
  20,    // meetings per year
  3,     // average hours per meeting
  true   // include correctness guarantee
);

console.log(estimate.totalYearlyCost);
```

### Getting Platform Pricing

```typescript
import { getPlatformPricingTier, getPlatformMonthlyPrice } from '@/lib/pricing';

// Get full tier information
const tier = getPlatformPricingTier(25000);
console.log(tier.label); // "10.001 - 30.000 κάτοικοι"
console.log(tier.monthlyPrice); // 400

// Get just the monthly price
const monthlyPrice = getPlatformMonthlyPrice(25000); // 400
```

### Component Integration

#### Pricing Display Components

```typescript
import { 
  PLATFORM_PRICING_TIERS, 
  SESSION_PROCESSING, 
  formatCurrency 
} from '@/lib/pricing';

// Display platform pricing tiers
{PLATFORM_PRICING_TIERS.map((tier, index) => (
  <PricingTier 
    key={index}
    population={tier.label}
    price={tier.monthlyPrice === 0 ? "Δωρεάν" : `${formatCurrency(tier.monthlyPrice)} / μήνα`}
  />
))}

// Display session processing price
<p>{formatCurrency(SESSION_PROCESSING.pricePerHour)} / ώρα συνεδρίασης</p>
```

#### Form Defaults

```typescript
import { 
  getSessionProcessingPrice, 
  getCurrentCorrectnessGuaranteePrice,
  CURRENT_OFFER_VERSION 
} from '@/lib/pricing';

const defaultValues = {
  ingestionPerHourPrice: getSessionProcessingPrice(), // 9
  version: CURRENT_OFFER_VERSION, // 3
  // ... other defaults
};
```

## File Organization

### Configuration (`config.ts`)

- **Pricing tiers and constants**: All static pricing data
- **Helper functions**: `getPlatformPricingTier()`, `getCorrectnessPricing()`
- **Type definitions**: `PlatformPricingTier`, `CorrectnessPricingVersion`

### Calculations (`calculations.ts`)

- **Core calculation logic**: `calculateOfferTotals()`, `estimateYearlyPricing()`
- **Payment plan generation**: Automatic Friday payment dates
- **Utility functions**: Price lookups and estimates

### Public API (`index.ts`)

- **Clean exports**: All public functions and types
- **Convenience re-exports**: Most commonly used functions

## Integration Points

### Components Using Pricing

1. **`src/components/static/Pricing.tsx`**: Public pricing calculator
2. **`src/components/admin/offers/offer-form.tsx`**: Admin offer creation
3. **`src/components/offer-letter/offer-letter.tsx`**: Generated offer letters
4. **`src/components/static/About.tsx`**: Landing page pricing display

### Backward Compatibility

The pricing system maintains backward compatibility by:

1. **Re-exporting from utils**: `calculateOfferTotals` still available from `@/lib/utils`
2. **Version defaulting**: Legacy offers without version default to version 1
3. **Conditional logic**: Different calculation paths based on offer version

## Making Changes

### Adding New Pricing Tiers

1. Add new tier to `PLATFORM_PRICING_TIERS` array
2. Ensure proper ordering by population ranges
3. Update tests if needed

### Updating Session Processing Price

1. Modify `SESSION_PROCESSING.pricePerHour`
2. Existing offers will continue using their stored `ingestionPerHourPrice`

### Adding New Correctness Guarantee Version

1. Add new version to `CORRECTNESS_GUARANTEE_PRICING` array
2. Update `CURRENT_OFFER_VERSION` to the new version number
3. Test calculation logic with new version

### Important Rules

❌ **NEVER** modify existing pricing tier values in a way that would change existing offer calculations
❌ **NEVER** remove or reorder existing correctness guarantee versions
✅ **ALWAYS** add new versions rather than modifying existing ones
✅ **ALWAYS** test pricing calculations after changes
✅ **ALWAYS** update documentation when adding new features

## Testing

### Running Pricing Tests

```bash
npm test -- --testNamePattern="calculateOfferTotals"
```

### Test Coverage

The pricing system includes comprehensive tests for:

- **Offer total calculations**: All pricing scenarios and versions
- **Payment plan generation**: Correct Friday payment dates
- **Platform tier lookup**: Population-based pricing
- **Yearly estimates**: Multi-parameter calculations

### Test Structure

```typescript
import { calculateOfferTotals } from '@/lib/pricing';

describe('calculateOfferTotals', () => {
  it('should calculate version 3 pricing correctly', () => {
    const offer = {
      // ... test offer properties
      version: 3,
      correctnessGuarantee: true,
      hoursToGuarantee: 10
    };
    
    const result = calculateOfferTotals(offer);
    
    expect(result.correctnessGuaranteeCost).toBe(110); // 10 * 11
  });
});
```

## Troubleshooting

### Common Issues

1. **TypeScript errors on offer objects**: Ensure all required fields are present (`version`, `hoursToGuarantee`)
2. **Incorrect pricing calculations**: Check that the offer version matches expected pricing rules
3. **Missing imports**: Use `@/lib/pricing` instead of `@/lib/utils` for new code

### Debugging Pricing

```typescript
import { calculateOfferTotals, getCorrectnessPricing } from '@/lib/pricing';

const offer = { /* ... */ };
const totals = calculateOfferTotals(offer);

console.log('Offer version:', offer.version);
console.log('Correctness pricing:', getCorrectnessPricing(offer.version || 1));
console.log('Platform total:', totals.platformTotal);
console.log('Ingestion total:', totals.ingestionTotal);
console.log('Correctness cost:', totals.correctnessGuaranteeCost);
console.log('Final total:', totals.total);
```

## Future Considerations

### Planned Enhancements

1. **Regional pricing**: Different pricing for municipalities vs regions
2. **Volume discounts**: Automatic discounts for large municipalities
3. **Feature-based pricing**: Optional premium features
4. **Currency support**: Multi-currency pricing for international expansion

### Migration Strategy

When significant pricing changes are needed:

1. **Create new version**: Add to `CORRECTNESS_GUARANTEE_PRICING`
2. **Update current version**: Change `CURRENT_OFFER_VERSION`
3. **Gradual rollout**: New offers use new pricing, existing offers unchanged
4. **Communication**: Notify clients of pricing changes for future contracts 