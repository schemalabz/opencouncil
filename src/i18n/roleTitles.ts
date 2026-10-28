import "server-only";
import { getTranslations } from 'next-intl/server';
import type { RoleTitles } from '@/lib/utils/roles';
import { catalogLocaleForCityLanguage } from './config';

/**
 * The role titles in a given locale, for server code (getRoleTitle and the
 * helpers built on it).
 *
 * Documents, task requests, highlight videos and QR strips pass the city's
 * language: the municipality, the transcript and the councillors read that
 * language, whatever the language of the admin who started the work.
 *
 * A city language without a catalog takes the English titles, but keeps its
 * own code as `locale`: the stored role names are in that language, so they
 * still win over a translated head title (see getRoleTitle).
 */
export async function getRoleTitles(locale: string): Promise<RoleTitles> {
    return { t: await getTranslations({ locale: catalogLocaleForCityLanguage(locale), namespace: 'Person' }), locale };
}
