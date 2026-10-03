import { getIntlLocale } from './time';

/**
 * A distance the way a reader estimates one: the nearest 50 m below a
 * kilometre, a tenth of a kilometre below ten, whole kilometres beyond. The
 * unit and the decimal mark come from the locale («1,1 χλμ.», «1.1 km»).
 */
export function formatDistance(meters: number, locale: string): string {
    const tag = getIntlLocale(locale);
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    // Branch on the rounded value: 980 m rounds to 1,000 and must read as a kilometre.
    if (rounded < 1000) {
        return new Intl.NumberFormat(tag, { style: 'unit', unit: 'meter', unitDisplay: 'short' }).format(rounded);
    }
    const km = meters / 1000;
    return new Intl.NumberFormat(tag, {
        style: 'unit',
        unit: 'kilometer',
        unitDisplay: 'short',
        maximumFractionDigits: km < 10 ? 1 : 0,
    }).format(km);
}
