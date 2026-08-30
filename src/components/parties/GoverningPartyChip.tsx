import { useTranslations } from 'next-intl';

/**
 * Only the governing party is named as such — which of the others support the
 * mayor is not in the data, and inferring it would put a political claim on
 * the page. A chip rather than a bold line: it is a standing, not a figure.
 * The wash is the party's own colour at low alpha and the text stays
 * foreground, so it reads on a pale παράταξη as well as a dark one.
 */
export function GoverningPartyChip({ colorHex }: { colorHex: string }) {
    const t = useTranslations('cityOverview');
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none text-foreground"
            style={{ backgroundColor: `color-mix(in srgb, ${colorHex} 22%, transparent)` }}
        >
            {t('governingParty')}
        </span>
    );
}
