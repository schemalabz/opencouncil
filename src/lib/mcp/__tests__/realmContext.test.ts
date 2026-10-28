/** @jest-environment node */
import { cityBaseUrl, mcpRealmStore, reachesEveryRealm, rememberCityRealm, requestContext } from '../realm-context';

const SUPERADMIN = { superadmin: true, cityIds: new Set<string>(), bodyIds: new Set<string>() };
const CITY_ADMIN = { superadmin: false, cityIds: new Set(['athens']), bodyIds: new Set<string>() };

const on = <T>(host: string, fn: () => T) =>
    mcpRealmStore.run(requestContext('greece', host, { userId: 'u1' } as never, { adminAccess: SUPERADMIN }), fn);

describe('reachesEveryRealm', () => {
    it('is true for a superadmin only', () => {
        expect(mcpRealmStore.run(requestContext('greece', null, null, { adminAccess: SUPERADMIN }), reachesEveryRealm)).toBe(true);
        expect(mcpRealmStore.run(requestContext('greece', null, null, { adminAccess: CITY_ADMIN }), reachesEveryRealm)).toBe(false);
        expect(mcpRealmStore.run(requestContext('greece', null, null), reachesEveryRealm)).toBe(false);
        expect(reachesEveryRealm()).toBe(false);
    });
});

describe('cityBaseUrl', () => {
    // City pages are tenant-isolated: a Polish city 404s on opencouncil.gr.
    it('sends a city of another realm to that realm\'s domain', () => {
        expect(on('opencouncil.gr', () => {
            rememberCityRealm('krakow', 'poland');
            return cityBaseUrl('krakow');
        })).toBe('https://opencouncil.pl');
    });

    it('keeps a city of the request realm, and an unchecked one, on the request origin', () => {
        expect(on('opencouncil.gr', () => {
            rememberCityRealm('athens', 'greece');
            return [cityBaseUrl('athens'), cityBaseUrl('chania')];
        })).toEqual(['https://opencouncil.gr', 'https://opencouncil.gr']);
    });

    it('keeps a preview\'s links on the preview, whatever the realm', () => {
        expect(on('pr-7.opencouncil.dev', () => {
            rememberCityRealm('krakow', 'poland');
            return cityBaseUrl('krakow');
        })).toBe('https://pr-7.opencouncil.dev');
    });
});
