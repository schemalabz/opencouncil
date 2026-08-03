"use client";

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { localizeText } from '@/lib/serbian';

/**
 * Render-time text localizer bound to the active locale: transliterates to
 * the active Serbian script on `sr`/`sr-Latn`, and is the identity for every
 * other locale. The locale is constant for the lifetime of a page, so the
 * returned function is referentially stable and safe under React.memo.
 *
 * Display-only — never feed its output back into state that gets persisted;
 * the database keeps the originally-authored script.
 */
export function useLocalizeText(): (text: string) => string {
    const locale = useLocale();
    return useCallback((text: string) => localizeText(text, locale), [locale]);
}
