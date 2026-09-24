/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

const mockGetCity = jest.fn();
jest.mock('@/lib/db/cities', () => ({ getCity: (...args: unknown[]) => mockGetCity(...args) }));
const mockGetPeopleForCity = jest.fn();
jest.mock('@/lib/db/people', () => ({ getPeopleForCity: (...args: unknown[]) => mockGetPeopleForCity(...args) }));
const mockGetClaimedPersonIds = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({ getClaimedPersonIds: (...args: unknown[]) => mockGetClaimedPersonIds(...args) }));

// Echo the key and values, so the test sees which locale and which date went in.
const mockGetTranslations = jest.fn();
jest.mock('next-intl/server', () => ({ getTranslations: (...args: unknown[]) => mockGetTranslations(...args) }));

import { getCouncilQrStrips } from '@/lib/admin/councilQrStrips';
import { verifyPersonClaimToken } from '@/lib/auth/personClaim';

const councilBody = { id: 'body-council', name: 'Δημοτικό Συμβούλιο', type: 'council' };
const role = (overrides: Record<string, unknown>) => ({
    id: `role-${Math.random()}`,
    cityId: null,
    partyId: null,
    administrativeBodyId: null,
    administrativeBody: null,
    name: null,
    isHead: false,
    electedOrder: null,
    startDate: null,
    endDate: null,
    ...overrides,
});
const person = (id: string, name: string, roles: ReturnType<typeof role>[]) => ({ id, name, cityId: 'chania', roles });

beforeEach(() => {
    mockGetCity.mockReset();
    mockGetPeopleForCity.mockReset();
    mockGetClaimedPersonIds.mockReset();
    mockGetTranslations.mockReset();
    const t = (key: string, values?: Record<string, string>) => (values ? `${key}:${values.date}` : key);
    t.raw = (key: string) => `raw:${key}`;
    mockGetTranslations.mockResolvedValue(t);
});

describe('getCouncilQrStrips', () => {
    it('returns null for an unknown city', async () => {
        mockGetCity.mockResolvedValue(null);
        mockGetPeopleForCity.mockResolvedValue([]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set());
        expect(await getCouncilQrStrips('nowhere')).toBeNull();
    });

    it('gives a strip to every unclaimed council member, in the order of the people page, with one shared expiry and texts in the city language', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', name: 'Χανιά', realm: 'greece', language: 'el', timezone: 'Europe/Athens' });
        const seat = (electedOrder: number) => role({ administrativeBodyId: councilBody.id, administrativeBody: councilBody, electedOrder });
        // Deliberately out of order: the sheet must follow the elected order, not the query.
        mockGetPeopleForCity.mockResolvedValue([
            person('member-3', 'Αδάμ Μπούτζουκας', [seat(3)]),
            // A deputy mayor holds a city-level role and a council seat.
            person('deputy', 'Ελένη Αντωνάκη', [role({ cityId: 'chania', name: 'Αντιδήμαρχος Πολιτισμού' }), seat(2)]),
            person('claimed', 'Αικατερίνη Μανιμανάκη', [seat(4)]),
            // City staff, not elected: a city-level role but no council seat.
            person('secretary', 'Νίκος Γραμματικάκης', [role({ cityId: 'chania', name: 'Γενικός Γραμματέας' })]),
            person('member-1', 'Στέλιος Βρυάκης', [seat(1)]),
            person('mayor', 'Βασίλειος Μαμαλάκης', [role({ cityId: 'chania', name: 'Δήμαρχος', isHead: true })]),
            person('committee-only', 'Γιώργος Παπαδάκης', [
                role({ administrativeBodyId: 'body-committee', administrativeBody: { id: 'body-committee', name: 'Επιτροπή', type: 'committee' } }),
            ]),
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set(['claimed']));

        const strips = await getCouncilQrStrips('chania');

        expect(strips!.cityName).toBe('Χανιά');
        expect(strips!.people.map((p) => p.id)).toEqual(['mayor', 'member-1', 'deputy', 'member-3']);
        const byId = Object.fromEntries(strips!.people.map((p) => [p.id, p]));
        expect(byId.mayor.role).toBe('Δήμαρχος');
        expect(byId.deputy.role).toBe('Αντιδήμαρχος Πολιτισμού');
        expect(byId['member-1'].role).toBeNull();
        for (const p of strips!.people) {
            const token = new URL(p.joinUrl).searchParams.get('c') as string;
            expect(verifyPersonClaimToken(token)).toBe(p.id);
        }
        const exps = strips!.people.map((p) => {
            const token = new URL(p.joinUrl).searchParams.get('c') as string;
            return token.split('.')[1];
        });
        expect(new Set(exps).size).toBe(1);

        expect(mockGetTranslations).toHaveBeenCalledWith({ locale: 'el', namespace: 'admin.cities.qrStrip' });
        expect(strips!.texts.private).toBe('raw:private');
        expect(strips!.texts.validUntil).toMatch(/^validUntil:\d{1,2} \S+ \d{4}$/);
    });

    it('mints new codes on every call', async () => {
        mockGetCity.mockResolvedValue({ id: 'chania', name: 'Χανιά', realm: 'greece', language: 'el', timezone: 'Europe/Athens' });
        mockGetPeopleForCity.mockResolvedValue([
            person('member', 'Αδάμ Μπούτζουκας', [role({ administrativeBodyId: councilBody.id, administrativeBody: councilBody })]),
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set());
        const spy = jest.spyOn(Date, 'now');
        spy.mockReturnValue(1_800_000_000_000);
        const first = await getCouncilQrStrips('chania');
        // The expiry is kept to the second: a download a second later has new codes.
        spy.mockReturnValue(1_800_000_001_000);
        const second = await getCouncilQrStrips('chania');
        spy.mockRestore();
        expect(first!.people[0].joinUrl).not.toBe(second!.people[0].joinUrl);
    });
});
