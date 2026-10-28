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

import { getCouncilQrStrips, getQrEligiblePersonIds } from '../councilQrStrips';
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
    const t = (key: string, values?: Record<string, string>) => (values ? `${key}:${values.date}` : key === 'president' ? 'Πρόεδρος' : key);
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

    it('titles a mayor without a stored role name from the Person catalog, in the city language', async () => {
        mockGetCity.mockResolvedValue({ id: 'rouen', name: 'Rouen', realm: 'france', language: 'fr', timezone: 'Europe/Paris' });
        const { getTranslationsFromCatalog } = jest.requireActual('../../../../tests/helpers/catalog');
        mockGetTranslations.mockImplementation(async (o: { locale: string; namespace: string }) =>
            o.namespace === 'Person' ? getTranslationsFromCatalog(o) : Object.assign((key: string) => key, { raw: (key: string) => key }));
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Nicolas Mayer-Rossignol', [role({ cityId: 'rouen', isHead: true })]),
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set());

        const strips = await getCouncilQrStrips('rouen');

        expect(strips!.people[0].role).toBe('Maire');
    });

    it('uses the English catalog for a city language that has none, not Greek, and keeps a stored role name', async () => {
        mockGetCity.mockResolvedValue({ id: 'krakow', name: 'Kraków', realm: 'greece', language: 'pl', timezone: 'Europe/Warsaw' });
        const { getTranslationsFromCatalog } = jest.requireActual('../../../../tests/helpers/catalog');
        mockGetTranslations.mockImplementation(async (o: { locale: string; namespace: string }) =>
            o.namespace === 'Person' ? getTranslationsFromCatalog(o) : Object.assign((key: string) => key, { raw: (key: string) => key }));
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Aleksander Miszalski', [role({ cityId: 'krakow', isHead: true })]),
            person('chair', 'Rafał Komarewicz', [role({ cityId: 'krakow', isHead: true, name: 'Przewodniczący Rady Miasta' })]),
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set());

        const strips = await getCouncilQrStrips('krakow');

        expect(mockGetTranslations).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en', namespace: 'admin.cities.qrStrip' }));
        expect(Object.fromEntries(strips!.people.map((p) => [p.name, p.role]))).toEqual({
            'Aleksander Miszalski': 'Mayor',
            'Rafał Komarewicz': 'Przewodniczący Rady Miasta',
        });
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

const chania = { id: 'chania', name: 'Χανιά', realm: 'greece', language: 'el', timezone: 'Europe/Athens' };
const communityBody = { id: 'body-k3', name: '3η Δημοτική Κοινότητα', type: 'community' };
const seatIn = (body: typeof councilBody | typeof communityBody, overrides: Record<string, unknown> = {}) =>
    role({ administrativeBodyId: body.id, administrativeBody: body, ...overrides });

describe('community councillors and a narrowed sheet', () => {
    beforeEach(() => {
        mockGetCity.mockResolvedValue(chania);
        mockGetPeopleForCity.mockResolvedValue([
            person('k-member', 'Μαρία Κοινοτική', [seatIn(communityBody)]),
            person('k-president', 'Γιάννης Προεδράκης', [seatIn(communityBody, { isHead: true })]),
            person('member', 'Αδάμ Μπούτζουκας', [seatIn(councilBody, { electedOrder: 1 })]),
            person('claimed', 'Αικατερίνη Μανιμανάκη', [seatIn(councilBody, { electedOrder: 2 })]),
            person('secretary', 'Νίκος Γραμματικάκης', [role({ cityId: 'chania', name: 'Γενικός Γραμματέας' })]),
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set(['claimed']));
    });

    it('gives community councillors a strip after the council, titled with their community', async () => {
        const strips = await getCouncilQrStrips('chania');
        expect(strips!.people.map((p) => p.id)).toEqual(['member', 'k-president', 'k-member']);
        const byId = Object.fromEntries(strips!.people.map((p) => [p.id, p]));
        expect(byId['k-president'].role).toBe('Πρόεδρος - 3η Δημοτική Κοινότητα');
        expect(byId['k-member'].role).toBe('3η Δημοτική Κοινότητα');
        // The title is the councillor's, so it is in the city's language too.
        expect(mockGetTranslations).toHaveBeenCalledWith({ locale: 'el', namespace: 'Person' });
    });

    it('lists as eligible exactly the people the whole-city sheet prints', async () => {
        const strips = await getCouncilQrStrips('chania');
        expect(await getQrEligiblePersonIds('chania')).toEqual(strips!.people.map((p) => p.id));
    });

    it('narrows to the people it is asked for, and never prints one who is not eligible', async () => {
        const strips = await getCouncilQrStrips('chania', ['k-member', 'claimed', 'secretary', 'nobody']);
        expect(strips!.people.map((p) => p.id)).toEqual(['k-member']);
    });
});
