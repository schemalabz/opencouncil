import type { AuthorityType } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { authorityKey } from '@/lib/utils/authority';

/**
 * Only the governing party is named as such — which of the others support the
 * head of the authority is not in the data, and inferring it would put a political claim on
 * the page. A chip rather than a bold line: it is a standing, not a figure.
 * The wash is the party's own colour at low alpha and the text stays
 * foreground, so it reads on a pale παράταξη as well as a dark one.
 */
export function GoverningPartyChip({ colorHex, authorityType }: { colorHex: string; authorityType: AuthorityType }) {
    const t = useTranslations('cityOverview');
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none text-foreground"
            style={{ backgroundColor: `color-mix(in srgb, ${colorHex} 22%, transparent)` }}
        >
            {t(authorityKey('governingParty', { authorityType }))}
        </span>
    );
}
