/** @jest-environment node */
// Every gate's unit test mocks getConsentedPersonIds / hasVoicePrintConsent,
// or compares a where against the imported rule constant, so a broken rule
// passes all of them. These pin the rule itself, through a findMany mock
// that applies the where it is given.
type Period = { personId: string; source: 'PERSON' | 'ADMIN'; withdrawnAt: Date | null };
let periods: Period[] = [];
const matches = (row: Period, where: Record<string, unknown>) => Object.entries(where).every(([field, cond]) => {
    const value = row[field as keyof Period];
    if (cond !== null && typeof cond === 'object' && 'in' in (cond as object)) return (cond as { in: unknown[] }).in.includes(value);
    return value === cond;
});
const mockFindMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) => periods.filter((row) => matches(row, where)));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { voicePrintConsent: { findMany: (args: { where: Record<string, unknown> }) => mockFindMany(args) } } }));

import { getConsentedPersonIds, hasVoicePrintConsent, voicePrintConsentInForce, voicePrintsWithoutConsentWhere } from '../voicePrintConsentRule';

beforeEach(() => {
    periods = [
        { personId: 'open-person', source: 'PERSON', withdrawnAt: null },
        { personId: 'open-admin', source: 'ADMIN', withdrawnAt: null },
        { personId: 'withdrawn', source: 'PERSON', withdrawnAt: new Date('2026-10-01') },
    ];
});

describe('the consent rule', () => {
    it('is an open period, whoever recorded it', async () => {
        expect(await getConsentedPersonIds(['open-person', 'open-admin', 'withdrawn', 'never'])).toEqual(new Set(['open-person', 'open-admin']));
        expect(await hasVoicePrintConsent('open-admin')).toBe(true);
        expect(await hasVoicePrintConsent('withdrawn')).toBe(false);
        expect(await hasVoicePrintConsent('never')).toBe(false);
    });

    it('spells the relation filters with that open period', () => {
        expect(voicePrintConsentInForce).toEqual({ voicePrintConsents: { some: { withdrawnAt: null } } });
        expect(voicePrintsWithoutConsentWhere).toEqual({ person: { voicePrintConsents: { none: { withdrawnAt: null } } } });
    });
});
