"use client";

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoleTitles } from '@/lib/utils/roles';

/** The role titles in the page's locale, for getRoleTitle and the helpers built on it. */
export function useRoleTitles(): RoleTitles {
    const t = useTranslations('Person');
    const locale = useLocale();
    return useMemo(() => ({ t, locale }), [t, locale]);
}
