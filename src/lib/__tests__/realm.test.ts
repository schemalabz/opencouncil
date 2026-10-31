import {
    realmForHost,
    createRealmResolver,
    isKnownRealmHost,
    PREVIEW_DOMAIN,
    computeForeignLocales,
    foreignLocalesForRealm,
    isRealm,
    isRealmApexHost,
    metadataBaseForHost,
    realmOverride,
    effectiveRealm,
    getRealmCountry,
    getRealmGeocoding,
    getRealmContactPhone,
    getRealmStage,
    telHref,
    ALL_REALMS,
} from '../realm';


describe('createRealmResolver', () => {
    // Parent declared first so a naive first-match would wrongly return it for
    // hosts on the child's domain — the ordering under test must not depend on
    // declaration order.
    const NESTED = {
        parent: { domain: 'example.org' },
        child: { domain: 'sub.example.org' },
    };
    const resolve = createRealmResolver(NESTED);

    it('resolves a host on a subdomain realm to that realm, not its parent', () => {
        expect(resolve('sub.example.org')).toBe('child');
    });

    it('resolves subdomains of a subdomain realm to that realm', () => {
        expect(resolve('pr-7.sub.example.org')).toBe('child');
    });

    it('resolves other subdomains of the parent domain to the parent realm', () => {
        expect(resolve('pr-7.preview.example.org')).toBe('parent');
    });

    it('does not match a label that merely ends with a subdomain realm label', () => {
        expect(resolve('notsub.example.org')).toBe('parent');
    });

    it('strips the port and lowercases the host', () => {
        expect(resolve('SUB.Example.ORG:443')).toBe('child');
    });

    it('returns null when no realm domain matches', () => {
        expect(resolve('unknown.com')).toBeNull();
        expect(resolve(null)).toBeNull();
    });
});

describe('realmForHost', () => {
    it('resolves the production apex domains', () => {
        expect(realmForHost('opencouncil.gr')).toBe('greece');
        expect(realmForHost('opencouncil.fr')).toBe('france');
        expect(realmForHost('opencouncil.cy')).toBe('cyprus');
        expect(realmForHost('opencouncil.rs')).toBe('serbia');
    });

    it.each([
        ['opencouncil.at', 'austria'],
        ['opencouncil.be', 'belgium'],
        ['opencouncil.fi', 'finland'],
        ['opencouncil.de', 'germany'],
        ['opencouncil.it', 'italy'],
        ['opencouncil.nl', 'netherlands'],
        ['opencouncil.pl', 'poland'],
        ['pt.opencouncil.eu', 'portugal'],
        ['opencouncil.es', 'spain'],
    ])('resolves %s and its www subdomain to %s', (host, realm) => {
        expect(realmForHost(host)).toBe(realm);
        expect(realmForHost(`www.${host}`)).toBe(realm);
    });

    it('does not match the parent of a Portugal realm domain', () => {
        expect(realmForHost('opencouncil.eu')).toBe('greece');
    });

    it('resolves subdomains of a realm domain to that realm', () => {
        expect(realmForHost('www.opencouncil.gr')).toBe('greece');
        expect(realmForHost('www.opencouncil.fr')).toBe('france');
        expect(realmForHost('www.opencouncil.cy')).toBe('cyprus');
        expect(realmForHost('www.opencouncil.rs')).toBe('serbia');
    });

    it.each([null, undefined, '', 'localhost:3000', 'example.com', 'pr-7.opencouncil.dev'])(
        'defaults %p to greece',
        (host) => {
            expect(realmForHost(host)).toBe('greece');
        },
    );
});

describe('Bosnia and Herzegovina realm', () => {
    it('resolves the Bosnia subdomain without assigning the parent EU domain', () => {
        expect(realmForHost('ba.opencouncil.eu')).toBe('bosnia');
        expect(isKnownRealmHost('ba.opencouncil.eu')).toBe(true);
        expect(isKnownRealmHost('opencouncil.eu')).toBe(false);
    });
});

describe('isKnownRealmHost', () => {
    // A plain suffix test approves these: they really do end with a realm
    // domain. `URL`'s host setter then truncates at the delimiter, so the
    // origin that results is the attacker's. The allowlist guards a magic-link
    // token, so it must reject anything that is not a bare hostname.
    it.each([
        'evil.example.com/x.opencouncil.gr',
        'evil.example.com?x.opencouncil.gr',
        'evil.example.com#x.opencouncil.gr',
        'evil.example.com\\x.opencouncil.gr',
        'evil.example.com/x.opencouncil.dev',
    ])('rejects the delimiter-embedded host %s', (host) => {
        expect(isKnownRealmHost(host)).toBe(false);
    });

    it('accepts apex and subdomain hosts of any realm domain', () => {
        expect(isKnownRealmHost('opencouncil.gr')).toBe(true);
        expect(isKnownRealmHost('opencouncil.fr')).toBe(true);
        expect(isKnownRealmHost('opencouncil.cy')).toBe(true);
        expect(isKnownRealmHost('www.opencouncil.fr')).toBe(true);
    });

    // Previews belong to no realm, so `realmForHost` defaults them to greece —
    // but they are still our own hosts, and the checks gated on this one (SEO
    // redirects, magic-link host rewrite, OG metadata base) must run there too.
    it('accepts the preview domain and its subdomains', () => {
        expect(isKnownRealmHost(PREVIEW_DOMAIN)).toBe(true);
        expect(isKnownRealmHost(`pr-7.${PREVIEW_DOMAIN}`)).toBe(true);
        expect(isKnownRealmHost(`PR-7.${PREVIEW_DOMAIN.toUpperCase()}:443`)).toBe(true);
    });

    it('rejects a lookalike of the preview domain', () => {
        expect(isKnownRealmHost(`${PREVIEW_DOMAIN}.evil.com`)).toBe(false);
        expect(isKnownRealmHost(`evil${PREVIEW_DOMAIN}`)).toBe(false);
    });

    it('rejects unknown hosts', () => {
        expect(isKnownRealmHost('evil.com')).toBe(false);
        expect(isKnownRealmHost('localhost')).toBe(false);
        expect(isKnownRealmHost('')).toBe(false);
        expect(isKnownRealmHost(null)).toBe(false);
    });
});

describe('isRealm', () => {
    it('accepts configured realm names and rejects everything else', () => {
        expect(isRealm('greece')).toBe(true);
        expect(isRealm('serbia')).toBe(true);
        expect(isRealm('atlantis')).toBe(false);
        expect(isRealm('')).toBe(false);
        expect(isRealm(null)).toBe(false);
        expect(isRealm(undefined)).toBe(false);
        // Object prototype keys must not slip through the `in` check.
        expect(isRealm('toString')).toBe(false);
    });
});

describe('isRealmApexHost', () => {
    it('matches only the exact production apex, port-insensitive', () => {
        expect(isRealmApexHost('opencouncil.gr')).toBe(true);
        expect(isRealmApexHost('OpenCouncil.RS:443')).toBe(true);
    });

    it('rejects subdomains (previews), localhost and unknown hosts', () => {
        expect(isRealmApexHost('pr-7.opencouncil.dev')).toBe(false);
        expect(isRealmApexHost('www.opencouncil.gr')).toBe(false);
        expect(isRealmApexHost('localhost:3000')).toBe(false);
        expect(isRealmApexHost('evil.com')).toBe(false);
        expect(isRealmApexHost(null)).toBe(false);
    });
});

describe('realmOverride / effectiveRealm', () => {
    it('honors a valid override cookie on preview hosts and localhost', () => {
        expect(realmOverride('pr-7.opencouncil.dev', 'serbia')).toBe('serbia');
        expect(effectiveRealm('pr-7.opencouncil.dev', 'serbia')).toBe('serbia');
        expect(effectiveRealm('localhost:3000', 'france')).toBe('france');
    });

    it('ignores the override on production apex hosts', () => {
        expect(realmOverride('opencouncil.gr', 'serbia')).toBeUndefined();
        expect(effectiveRealm('opencouncil.gr', 'serbia')).toBe('greece');
        expect(effectiveRealm('opencouncil.rs', 'greece')).toBe('serbia');
    });

    it('ignores invalid or absent cookie values and falls back to the host realm', () => {
        expect(realmOverride('pr-7.opencouncil.dev', 'atlantis')).toBeUndefined();
        expect(effectiveRealm('pr-7.opencouncil.dev', 'atlantis')).toBe('greece');
        expect(effectiveRealm('www.opencouncil.fr', undefined)).toBe('france');
        expect(effectiveRealm('localhost:3000', undefined)).toBe('greece');
    });
});

describe('computeForeignLocales', () => {
    it('includes other realms\' extraLocales as foreign, but never a realm\'s own', () => {
        const foreign = computeForeignLocales({
            alpha: { defaultLocale: 'el' },
            beta: { defaultLocale: 'sr', extraLocales: ['sr-Latn'] },
        });
        expect(foreign.alpha).toEqual(['sr', 'sr-Latn']);
        expect(foreign.beta).toEqual(['el']);
    });

    it('never marks a shared default locale as foreign', () => {
        const foreign = computeForeignLocales({
            alpha: { defaultLocale: 'el' },
            beta: { defaultLocale: 'el' },
            gamma: { defaultLocale: 'fr' },
        });
        expect(foreign.alpha).toEqual(['fr']);
        expect(foreign.beta).toEqual(['fr']);
        expect(foreign.gamma).toEqual(['el']);
    });
});

describe('foreignLocalesForRealm', () => {
    it('marks both Serbian locales foreign on non-Serbian realms', () => {
        expect(foreignLocalesForRealm('greece').sort()).toEqual(['fr', 'sr', 'sr-Latn']);
        expect(foreignLocalesForRealm('cyprus').sort()).toEqual(['fr', 'sr', 'sr-Latn']);
        expect(foreignLocalesForRealm('france').sort()).toEqual(['el', 'sr', 'sr-Latn']);
    });

    it('marks only el and fr foreign on serbia (en is shared, never foreign)', () => {
        expect(foreignLocalesForRealm('serbia').sort()).toEqual(['el', 'fr']);
    });

    it('marks every locale but en foreign on a realm whose default is en', () => {
        expect(foreignLocalesForRealm('poland').sort()).toEqual(['el', 'fr', 'sr', 'sr-Latn']);
    });
});

describe('getRealmCountry', () => {
    it('maps each realm to its uppercase ISO 3166-1 alpha-2 code', () => {
        expect(getRealmCountry('greece')).toBe('GR');
        expect(getRealmCountry('france')).toBe('FR');
        expect(getRealmCountry('cyprus')).toBe('CY');
        expect(getRealmCountry('serbia')).toBe('RS');
        expect(getRealmCountry('austria')).toBe('AT');
        expect(getRealmCountry('belgium')).toBe('BE');
        expect(getRealmCountry('finland')).toBe('FI');
        expect(getRealmCountry('germany')).toBe('DE');
        expect(getRealmCountry('italy')).toBe('IT');
        expect(getRealmCountry('netherlands')).toBe('NL');
        expect(getRealmCountry('poland')).toBe('PL');
        expect(getRealmCountry('portugal')).toBe('PT');
        expect(getRealmCountry('spain')).toBe('ES');
        expect(getRealmCountry('bosnia')).toBe('BA');
    });

    it('covers every realm, so a new one cannot silently geocode as Greece', () => {
        for (const realm of ALL_REALMS) {
            expect(getRealmCountry(realm)).toMatch(/^[A-Z]{2}$/);
        }
    });
});

describe('getRealmGeocoding', () => {
    it('pairs each realm with its own country and default locale', () => {
        expect(getRealmGeocoding('france')).toEqual({ country: 'FR', language: 'fr' });
        expect(getRealmGeocoding('serbia')).toEqual({ country: 'RS', language: 'sr' });
    });
});

describe('getRealmContactPhone', () => {
    it('uses the office number unless a realm has its own', () => {
        const sharedNumbers = ALL_REALMS.filter(realm => realm !== 'serbia').map(getRealmContactPhone);
        expect([...new Set(sharedNumbers)]).toEqual(['+30 211 198 0212']);
        expect(getRealmContactPhone('serbia')).toBe('0800 301167');
    });
});

describe('getRealmStage', () => {
    it('keeps Greece active and all other realms pending', () => {
        expect(getRealmStage('greece')).toBe('active');
        expect(ALL_REALMS.filter(realm => getRealmStage(realm) !== 'pending')).toEqual(['greece']);
    });
});

describe('telHref', () => {
    it('strips display spacing without touching the dialled digits', () => {
        expect(telHref('+30 211 198 0212')).toBe('tel:+302111980212');
    });

    it('keeps a national trunk zero — the Serbian line is domestic-only', () => {
        expect(telHref('0800 301167')).toBe('tel:0800301167');
    });
});

describe('metadataBaseForHost', () => {
    it('uses the realm canonical URL on a production apex', () => {
        expect(metadataBaseForHost('opencouncil.gr', 'greece')).toBe('https://opencouncil.gr');
        expect(metadataBaseForHost('opencouncil.fr', 'france')).toBe('https://opencouncil.fr');
    });

    it('uses the preview host itself, so a preview unfurls its own OG images', () => {
        expect(metadataBaseForHost('pr-7.opencouncil.dev', 'greece'))
            .toBe('https://pr-7.opencouncil.dev');
        // The realm override makes a preview render as serbia; the images
        // still have to come from the preview, not from opencouncil.rs.
        expect(metadataBaseForHost('pr-7.opencouncil.dev', 'serbia'))
            .toBe('https://pr-7.opencouncil.dev');
    });

    it('ignores a host we do not own', () => {
        expect(metadataBaseForHost('evil.com', 'greece')).toBe('https://opencouncil.gr');
        expect(metadataBaseForHost('localhost:3000', 'france')).toBe('https://opencouncil.fr');
        expect(metadataBaseForHost(null, 'serbia')).toBe('https://opencouncil.rs');
    });
});


describe('European realm coverage', () => {
    const countries = 'AD AL AT BA BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA XK'.split(' ');
    it('covers exactly the 43 researched countries with distinct country codes', () => {
        expect(ALL_REALMS.map(getRealmCountry).sort()).toEqual(countries);
    });
    it.each([
        ['hr.opencouncil.eu', 'croatia', 'HR'],
        ['gb.opencouncil.eu', 'united_kingdom', 'GB'],
        ['mk.opencouncil.eu', 'north_macedonia', 'MK'],
        ['xk.opencouncil.eu', 'kosovo', 'XK'],
    ])('routes %s to its own country and ignores overrides on that production host', (host, realm, country) => {
        expect(effectiveRealm(host, 'greece')).toBe(realm);
        expect(isKnownRealmHost(host)).toBe(true);
        expect(getRealmCountry(realmForHost(host))).toBe(country);
    });
    it('does not trust arbitrary EU subdomains', () => {
        expect(isKnownRealmHost('unknown.opencouncil.eu')).toBe(false);
        expect(isKnownRealmHost('opencouncil.eu')).toBe(false);
    });
});
