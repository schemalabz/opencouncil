// Browser-only by convention: reads `window`/`document`, so call it only from
// client components after mount (or in a lazy useState initializer guarded by
// a `typeof window` check). The request-scoped server resolver is
// `getRealm()` in `realm.server.ts`; the pure host resolver is `realm.ts`.
import { Realm } from '@prisma/client';
import { REALM_OVERRIDE_COOKIE, effectiveRealm } from './realm';

/**
 * The realm the browser should behave as: the host's realm, unless the
 * `oc-realm` override cookie is active (the `?realm=` escape hatch for
 * previews/localhost — see `realmOverride` in `realm.ts`). Client components
 * deriving realm from the host must use this instead of `realmForHost` so
 * they agree with what the server is rendering under the override.
 */
export function realmForBrowser(): Realm {
    const overrideCookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith(`${REALM_OVERRIDE_COOKIE}=`))
        ?.slice(REALM_OVERRIDE_COOKIE.length + 1);
    return effectiveRealm(window.location.hostname, overrideCookie);
}
