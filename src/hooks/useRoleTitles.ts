import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoleTitleCity, RoleTitles } from '@/lib/utils/roles';

/**
 * The role titles in the page's locale, for getRoleTitle and the helpers built
 * on it. The city says which language its stored role names are in, and which
 * kind of authority it is. The city is necessary: a default kind would give a
 * region the titles of a municipality with no error.
 */
export function useRoleTitles(city: RoleTitleCity): RoleTitles {
    const t = useTranslations('Person');
    const locale = useLocale();
    const contentLanguage = city.language;
    const authorityType = city.authorityType;
    return useMemo(() => ({ t, locale, contentLanguage, authorityType }), [t, locale, contentLanguage, authorityType]);
}
