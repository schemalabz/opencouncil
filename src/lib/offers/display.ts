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
