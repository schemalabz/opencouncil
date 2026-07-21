/**
 * Shared presentation logic for offers — the single source of truth for
 * everything the offer letter page and the offer PDF both render:
 * grammar (municipality vs region), optional-service checks, and the cost
 * table line items with amounts derived from the central pricing config.
 *
 * Keep this file renderer-agnostic: no JSX, no react-pdf, plain data out.
 */
import type { Offer } from '@prisma/client';
import {
    calculateOfferTotals,
    getCorrectnessPricing,
    PHYSICAL_PRESENCE,
    type OfferTotals,
} from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

// ─── Grammar ────────────────────────────────────────────────────────────────

export type OfferGrammar = {
    isRegion: boolean;
    /** "τον" / "την" — για τον Δήμο Χ, για την Περιφέρεια Ψ */
    articleAcc: string;
    /** "το" / "την" — Έκπτωση για το Δήμο Χ */
    accusative: string;
    /** "τον δήμο" / "την περιφέρεια" */
    def: string;
    /** "του δήμου" / "της περιφέρειας" */
    possessive: string;
    /** "του" / "της" */
    possessivePronoun: string;
    /** "δημότες" / "πολίτες" */
    demonym: string;
    /** "δημοτικού" / "περιφερειακού" */
    bodyAdj: string;
};

export function offerGrammar(offer: Offer): OfferGrammar {
    const isRegion = offer.recipientName.startsWith('Περιφέρεια');
    return isRegion
        ? {
              isRegion,
              articleAcc: 'την',
              accusative: 'την',
              def: 'την περιφέρεια',
              possessive: 'της περιφέρειας',
              possessivePronoun: 'της',
              demonym: 'πολίτες',
              bodyAdj: 'περιφερειακού',
          }
        : {
              isRegion,
              articleAcc: 'τον',
              accusative: 'το',
              def: 'τον δήμο',
              possessive: 'του δήμου',
              possessivePronoun: 'του',
              demonym: 'δημότες',
              bodyAdj: 'δημοτικού',
          };
}

// ─── Optional services ──────────────────────────────────────────────────────

export function offerHasEquipment(offer: Offer): boolean {
    return !!(offer.equipmentRentalName || offer.equipmentRentalDescription);
}

export function offerHasPhysicalPresence(offer: Offer): boolean {
    return !!(offer.physicalPresenceHours && offer.physicalPresenceHours > 0);
}

// ─── Cost table line items ──────────────────────────────────────────────────

export type OfferCostLine = {
    key: string;
    label: string;
    /** e.g. "12 μήνες", "200 ώρες" */
    qty: string;
    /** e.g. "2.000,00 €/μήνα" */
    rate: string;
    /** formatted amount, e.g. "24.000,00 €" */
    amount: string;
};

export type OfferCostBreakdown = {
    lines: OfferCostLine[];
    subtotal: string;
    /** null when no discount */
    discountLabel: string | null;
    /** formatted positive amount (render the minus sign yourself), null when none */
    discountAmount: string | null;
    total: string;
    /** the raw numbers, for anything beyond the table */
    totals: OfferTotals;
};

// ─── Procurement line items (numeric, post-discount) ────────────────────────
// Formal procurement documents (Οικονομική Προσφορά, Τεχνική Περιγραφή
// budget) intentionally show no discount line: unit prices are post-discount
// so line totals sum to the contracted amount.

export type ProcurementLineKey =
    | 'presence'
    | 'equipment'
    | 'ingestion'
    | 'platform'
    | 'correctness';

export type ProcurementLine = {
    key: ProcurementLineKey;
    /** e.g. "Μήνες", "Ώρες συνεδρίασης" */
    unitLabel: string;
    qty: number;
    /** post-discount, rounded to cents */
    unitPrice: number;
    /** qty × unitPrice, rounded to cents */
    total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function getOfferProcurementLines(offer: Offer): ProcurementLine[] {
    const totals = calculateOfferTotals(offer);
    const factor = 1 - offer.discountPercentage / 100;
    const lines: ProcurementLine[] = [];

    if (offerHasPhysicalPresence(offer)) {
        const unitPrice = round2(PHYSICAL_PRESENCE.pricePerHour * factor);
        lines.push({
            key: 'presence',
            unitLabel: 'Ώρες',
            qty: offer.physicalPresenceHours || 0,
            unitPrice,
            total: round2(unitPrice * (offer.physicalPresenceHours || 0)),
        });
    }
    if (offerHasEquipment(offer)) {
        const unitPrice = round2((offer.equipmentRentalPrice || 0) * factor);
        lines.push({
            key: 'equipment',
            unitLabel: 'Μήνες',
            qty: totals.months,
            unitPrice,
            total: round2(unitPrice * totals.months),
        });
    }
    {
        const unitPrice = round2(offer.ingestionPerHourPrice * factor);
        lines.push({
            key: 'ingestion',
            unitLabel: 'Ώρες συνεδρίασης',
            qty: offer.hoursToIngest,
            unitPrice,
            total: round2(unitPrice * offer.hoursToIngest),
        });
    }
    {
        const unitPrice = round2(offer.platformPrice * factor);
        lines.push({
            key: 'platform',
            unitLabel: 'Μήνες',
            qty: totals.months,
            unitPrice,
            total: round2(unitPrice * totals.months),
        });
    }
    if (offer.correctnessGuarantee && totals.hoursToGuarantee > 0) {
        const pricing = getCorrectnessPricing(offer.version || 1);
        const unitPrice = round2(pricing.pricePerUnit * factor);
        lines.push({
            key: 'correctness',
            unitLabel: pricing.unit === 'hour' ? 'Ώρες συνεδρίασης' : 'Συνεδριάσεις',
            qty: totals.hoursToGuarantee,
            unitPrice,
            total: round2(unitPrice * totals.hoursToGuarantee),
        });
    }
    return lines;
}

/**
 * CPV code for procurement documents. Overridable by the user at generation
 * time — this is only the default.
 */
export function deriveOfferCpv(offer: Offer): string {
    return offerHasPhysicalPresence(offer)
        ? '72400000-4 (Υπηρεσίες διαδικτύου)'
        : '72252000-6 (Υπηρεσίες ηλεκτρονικής αρχειοθέτησης)';
}

export function getOfferCostBreakdown(offer: Offer): OfferCostBreakdown {
    const totals = calculateOfferTotals(offer);
    const G = offerGrammar(offer);
    const lines: OfferCostLine[] = [];

    lines.push({
        key: 'platform',
        label: 'Πλατφόρμα OpenCouncil',
        qty: `${totals.months} μήνες`,
        rate: `${formatCurrency(offer.platformPrice)}/μήνα`,
        amount: formatCurrency(totals.platformTotal),
    });

    lines.push({
        key: 'ingestion',
        label: 'Ψηφιοποίηση συνεδριάσεων',
        qty: `${offer.hoursToIngest} ώρες`,
        rate: `${formatCurrency(offer.ingestionPerHourPrice)}/ώρα`,
        amount: formatCurrency(totals.ingestionTotal),
    });

    if (offerHasEquipment(offer)) {
        lines.push({
            key: 'equipment',
            label: offer.equipmentRentalName || 'Παροχή εξοπλισμού',
            qty: `${totals.months} μήνες`,
            rate: `${formatCurrency(offer.equipmentRentalPrice || 0)}/μήνα`,
            amount: formatCurrency(totals.equipmentRentalTotal),
        });
    }

    if (offerHasPhysicalPresence(offer)) {
        lines.push({
            key: 'presence',
            label: 'Φυσική παρουσία σε συνεδριάσεις',
            qty: `${offer.physicalPresenceHours} ώρες`,
            rate: `${formatCurrency(PHYSICAL_PRESENCE.pricePerHour)}/ώρα`,
            amount: formatCurrency(totals.physicalPresenceTotal),
        });
    }

    if (offer.correctnessGuarantee && totals.hoursToGuarantee > 0) {
        // Rate comes from the central pricing config for the offer's version —
        // never hardcode correctness prices in a renderer.
        const pricing = getCorrectnessPricing(offer.version || 1);
        const perHour = pricing.unit === 'hour';
        lines.push({
            key: 'correctness',
            label: 'Έλεγχος απομαγνητοφωνήσεων από άνθρωπο',
            qty: perHour
                ? `${totals.hoursToGuarantee} ώρες`
                : `${totals.hoursToGuarantee} συνεδριάσεις`,
            rate: perHour
                ? `${formatCurrency(pricing.pricePerUnit)}/ώρα`
                : `${formatCurrency(pricing.pricePerUnit)}/συνεδρίαση`,
            amount: formatCurrency(totals.correctnessGuaranteeCost),
        });
    }

    const hasDiscount = totals.discount > 0;
    return {
        lines,
        subtotal: formatCurrency(totals.subtotal),
        discountLabel: hasDiscount
            ? `Έκπτωση για ${G.accusative} ${offer.recipientName} (${offer.discountPercentage}%)`
            : null,
        discountAmount: hasDiscount ? formatCurrency(totals.discount) : null,
        total: formatCurrency(totals.total),
        totals,
    };
}
