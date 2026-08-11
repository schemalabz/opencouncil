'use client';

import { useEffect, useState } from 'react';
import { Realm } from '@prisma/client';
import { realmForBrowser } from '@/lib/realm.client';

/**
 * The realm a client component should render for, read from the browser's host.
 *
 * Only for components with no server parent to take the realm from — the error
 * and not-found boundaries. Anything inside the app tree should take it as a
 * prop from a server component (`getRealm()`), which is correct in the first
 * painted HTML rather than a paint later.
 *
 * Read in an effect, deliberately: the server and the first client render must
 * agree, so both start at the app's home realm and a second paint corrects it.
 * The alternative — resolving in a lazy initializer and marking the output
 * `suppressHydrationWarning` — is worse than it looks. React does not reconcile
 * suppressed text, so the server's value stays on screen for good; that is why
 * the footer on opencouncil.rs reads "Ελλάδα" indefinitely today. An effect also
 * corrects attributes, which suppression never does, so a `tel:` href built from
 * this can't be left pointing at the wrong number.
 */
export function useRealm(): Realm {
    const [realm, setRealm] = useState<Realm>('greece');

    useEffect(() => {
        setRealm(realmForBrowser());
    }, []);

    return realm;
}
