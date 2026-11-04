import type { CityProfile } from '../citySchemas';

export const cityProfile = {
    id: 'laholm', name: 'Laholm', name_en: 'Laholm',
    name_municipality: 'Laholms kommun', name_municipality_en: 'Laholm Municipality',
    municipality: 'Laholms kommun', authorityType: 'municipality',
    realm: 'sweden', status: 'demo', language: 'sv', timezone: 'Europe/Stockholm',
    officialSupport: false, boundary: null,
    counts: { meetings: 1, people: 61, parties: 10 },
    administrativeBodies: [], parties: [], url: 'https://se.opencouncil.eu/laholm',
} satisfies CityProfile;
