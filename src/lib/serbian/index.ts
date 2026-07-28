import { toScript, type SerbianScript } from './transliterate';

export { cyrillicToLatin, latinToCyrillic, toScript, type SerbianScript } from './transliterate';

export type SerbianLocale = 'sr' | 'sr-Latn';

/** `sr` is Serbian Cyrillic (CLDR's default script for bare `sr`); `sr-Latn` is Serbian Latin. */
export function isSerbianLocale(locale: string): locale is SerbianLocale {
    return locale === 'sr' || locale === 'sr-Latn';
}

export function serbianScriptForLocale(locale: string): SerbianScript | null {
    return locale === 'sr' ? 'cyrl' : locale === 'sr-Latn' ? 'latn' : null;
}

/**
 * Renders text in the script of the active locale. Strict no-op unless the
 * locale is a Serbian one, so Greek/English/French UIs are unaffected.
 *
 * Render-time only: call this AFTER cache reads (`unstable_cache` keys don't
 * include the locale) and never persist its output — the database always keeps
 * the originally-authored script.
 */
export function localizeText(text: string, locale: string): string {
    const script = serbianScriptForLocale(locale);
    return script ? toScript(text, script) : text;
}
