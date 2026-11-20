import "server-only";
import { getTranslations } from 'next-intl/server';
import type { RoleTitleCity, RoleTitles } from '@/lib/utils/roles';
import { catalogLocaleForCityLanguage } from './config';

/**
 * The role titles of a city, for server code (getRoleTitle and the helpers
 * built on it).
 *
 * Documents, task requests, highlight videos and QR strips pass the city
 * alone: the municipality, the transcript and the councillors read the city's
 * language, whatever the language of the admin who started the work.
 *
 * A city language without a catalog takes the English titles, but keeps its
 * own code as `locale`: the stored role names are in that language, so they
 * still win over a translated head title (see getRoleTitle).
 * A caller that writes for a reader passes the reader's locale too.
 *
 * The city also says which kind of authority it is, which names its head: the
 * mayor of a municipality, the regional governor of a region.
 */
export async function getRoleTitles(city: RoleTitleCity, locale: string = city.language): Promise<RoleTitles> {
    return {
        t: await getTranslations({ locale: catalogLocaleForCityLanguage(locale), namespace: 'Person' }),
        locale,
        contentLanguage: city.language,
        authorityType: city.authorityType,
    };
}
