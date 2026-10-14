import fs from 'fs';
import path from 'path';
import { catalogText } from '@/i18n/catalogText';
import { transliterateCatalog } from '@/lib/serbian/catalog';
import type { RoleTitles } from '@/lib/utils/roles';

const MESSAGES = path.join(__dirname, '../../messages');

/** A locale's whole catalog, merged as src/i18n/request.ts merges it: the main file, then one key per modular file. */
function messagesFor(locale: string): Record<string, unknown> {
    if (locale === 'sr-Latn') return transliterateCatalog(messagesFor('sr')) as Record<string, unknown>;
    const main = JSON.parse(fs.readFileSync(path.join(MESSAGES, `${locale}.json`), 'utf8'));
    const dir = path.join(MESSAGES, locale);
    const modular = fs.existsSync(dir)
        ? Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json'))
            .map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]))
        : {};
    return { ...main, ...modular };
}

/**
 * A stand-in for next-intl's `getTranslations` in unit tests: the real catalog
 * of the locale asked for, so a test can tell which language the code chose.
 *
 *     jest.mock('next-intl/server', () => ({
 *         getTranslations: (o: { locale: string; namespace: string }) =>
 *             jest.requireActual('<relative path>/tests/helpers/catalog').getTranslationsFromCatalog(o),
 *     }));
 */
export async function getTranslationsFromCatalog({ locale, namespace }: { locale: string; namespace: string }) {
    return catalogText({ messages: messagesFor(locale), namespace, locale });
}

/** The role titles from the real `Person` catalog of a locale. */
export function roleTitlesFor(locale: string): RoleTitles {
    return { t: catalogText({ messages: messagesFor(locale), namespace: 'Person', locale }), locale };
}
