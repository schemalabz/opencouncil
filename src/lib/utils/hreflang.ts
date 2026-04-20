import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export function buildHreflangAlternates(canonicalPath: string): NonNullable<Metadata['alternates']> {
    const languages: Record<string, string> = {
        [routing.defaultLocale]: canonicalPath,
        'x-default': canonicalPath,
    };
    for (const locale of routing.locales) {
        if (locale !== routing.defaultLocale) {
            languages[locale] = `/${locale}${canonicalPath === '/' ? '' : canonicalPath}`;
        }
    }
    return { canonical: canonicalPath, languages };
}
