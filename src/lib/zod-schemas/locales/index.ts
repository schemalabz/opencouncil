import * as z from 'zod';
import { cyrillicToLatin } from '@/lib/serbian/transliterate';
import type { AppLocale } from '@/i18n/config';
import { srErrorMap } from './sr';

/**
 * The error map that gives the default zod messages in the language of the
 * reader. Pass it per parse (`safeParse(x, { error })`, or the second argument
 * of `zodResolver`), never to `z.config`: zod 4.6 builds the messages on the
 * first read of `error`, with the global config of that moment, so a global
 * switch per request can give one reader the language of another.
 *
 * A message that a schema sets (`vmsg`) wins over this map. English has no
 * map: the default messages of zod are English.
 */
const errorMaps: Record<AppLocale, z.core.$ZodErrorMap | undefined> = {
    en: undefined,
    el: z.locales.el().localeError,
    fr: z.locales.fr().localeError,
    sr: srErrorMap,
    'sr-Latn': issue => {
        const message = srErrorMap(issue);
        return typeof message === 'string' ? cyrillicToLatin(message) : message;
    },
};

export function zodErrorMap(locale: string): z.core.$ZodErrorMap | undefined {
    return errorMaps[locale as AppLocale];
}
