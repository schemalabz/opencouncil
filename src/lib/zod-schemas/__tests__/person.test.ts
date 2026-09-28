import { personFormDataSchema } from '../person';

const validPerson = {
    name: 'Μαρία Παπαδοπούλου',
    name_en: 'Maria Papadopoulou',
    name_short: 'Μ. Παπαδοπούλου',
    name_short_en: 'M. Papadopoulou',
    profileUrl: '',
};

const withRoles = (roles: unknown) => ({ ...validPerson, roles: typeof roles === 'string' ? roles : JSON.stringify(roles) });

describe('personFormDataSchema', () => {
    it('parses the roles the person form sends', () => {
        const parsed = personFormDataSchema.parse(withRoles([
            { id: 'r1', personId: 'p1', cityId: 'athens', partyId: null, administrativeBodyId: null, isHead: false,
              name: 'Δήμαρχος', name_en: 'Mayor', startDate: '2024-01-01T00:00:00.000Z', endDate: null, electedOrder: null },
            { partyId: 'party1', name: '', name_en: null, electedOrder: 4 },
        ]));
        expect(parsed.roles[0]).toMatchObject({ cityId: 'athens', name: 'Δήμαρχος', startDate: new Date('2024-01-01T00:00:00.000Z'), endDate: null });
        expect(parsed.roles[1]).toMatchObject({ partyId: 'party1', name: null, electedOrder: 4 });
    });

    it('requires the roles, which replace all roles of the person', () => {
        expect(personFormDataSchema.safeParse(validPerson).success).toBe(false);
    });

    it('rejects roles that are not JSON', () => {
        const result = personFormDataSchema.safeParse(withRoles('not json'));
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('roles must be a JSON array');
    });

    it('rejects a role that ends before it starts', () => {
        const result = personFormDataSchema.safeParse(withRoles([{ cityId: 'athens', startDate: '2026-09-25', endDate: '2026-09-24' }]));
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toEqual(['roles', 0, 'endDate']);
    });

    it('reads removeImage as a boolean', () => {
        expect(personFormDataSchema.parse({ ...withRoles([]), removeImage: 'true' }).removeImage).toBe(true);
        expect(personFormDataSchema.parse(withRoles([])).removeImage).toBe(false);
    });
});
