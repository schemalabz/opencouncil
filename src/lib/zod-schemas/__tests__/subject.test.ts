import {
    subjectListQuerySchema,
    meetingSubjectListQuerySchema,
    DEFAULT_SUBJECT_LIMIT,
    MAX_SUBJECT_LIMIT,
    subjectAgendaFlagsSchema,
} from '../subject';

describe('subjectListQuerySchema', () => {
    it('applies the default limit when the caller names none', () => {
        expect(subjectListQuerySchema.parse({})).toEqual({
            introducerId: undefined,
            from: undefined,
            to: undefined,
            limit: DEFAULT_SUBJECT_LIMIT,
            includeUnreleased: false,
        });
    });

    // The schema does not know the city, so it keeps a date-only bound as a
    // day. resolveCityDateRange reads it in the city's zone.
    it('keeps a date-only bound as a calendar day', () => {
        const parsed = subjectListQuerySchema.parse({ from: '2025-01-01', to: '2025-12-31' });
        expect(parsed.from).toEqual({ kind: 'day', day: '2025-01-01' });
        expect(parsed.to).toEqual({ kind: 'day', day: '2025-12-31' });
    });

    it('keeps a full timestamp as an instant', () => {
        const parsed = subjectListQuerySchema.parse({ to: '2025-12-31T09:00:00.000Z' });
        expect(parsed.to).toEqual({ kind: 'instant', at: new Date('2025-12-31T09:00:00.000Z') });
    });

    it('rejects an unparseable date', () => {
        expect(() => subjectListQuerySchema.parse({ from: 'yesterday' })).toThrow(/Invalid 'from' date/);
    });

    // `new Date('2026-02-31')` rolls over to 3 March. Accepted, the upper bound
    // searched the wrong day, and without its end-of-day extension it dropped
    // that day's meetings too.
    it.each(['2026-02-31', '2026-04-31', '2026-02-29'])('rejects the impossible day %s in either bound', (day) => {
        expect(subjectListQuerySchema.safeParse({ from: day }).success).toBe(false);
        expect(subjectListQuerySchema.safeParse({ to: day }).success).toBe(false);
    });

    it('rejects a limit outside the allowed range', () => {
        expect(() => subjectListQuerySchema.parse({ limit: '0' })).toThrow();
        expect(() => subjectListQuerySchema.parse({ limit: String(MAX_SUBJECT_LIMIT + 1) })).toThrow();
        expect(() => subjectListQuerySchema.parse({ limit: 'many' })).toThrow();
    });

    it('rejects a limit that is not a whole number', () => {
        // parseInt alone reads these as 10 and 1, and serves a page of data.
        expect(() => subjectListQuerySchema.parse({ limit: '10abc' })).toThrow();
        expect(() => subjectListQuerySchema.parse({ limit: '1.5' })).toThrow();
        expect(() => subjectListQuerySchema.parse({ limit: ' 10' })).toThrow();
        expect(() => subjectListQuerySchema.parse({ limit: '-5' })).toThrow();
    });

    it('accepts a well-formed limit', () => {
        expect(subjectListQuerySchema.parse({ limit: '20' }).limit).toBe(20);
    });

    it('reads includeUnreleased with the stringbool lists and refuses any other value', () => {
        expect(subjectListQuerySchema.parse({ includeUnreleased: 'true' }).includeUnreleased).toBe(true);
        expect(subjectListQuerySchema.parse({ includeUnreleased: '1' }).includeUnreleased).toBe(true);
        expect(subjectListQuerySchema.parse({ includeUnreleased: 'false' }).includeUnreleased).toBe(false);
        expect(subjectListQuerySchema.safeParse({ includeUnreleased: 'maybe' }).success).toBe(false);
    });

    it('keeps introducerId', () => {
        expect(subjectListQuerySchema.parse({ introducerId: 'person-1' }).introducerId).toBe('person-1');
    });
});

describe('meetingSubjectListQuerySchema', () => {
    it('drops the date range, which the meeting path already fixes', () => {
        const parsed = meetingSubjectListQuerySchema.parse({ from: '2025-01-01', introducerId: 'person-1' });
        expect(parsed).not.toHaveProperty('from');
        expect(parsed.introducerId).toBe('person-1');
    });
});

describe('subjectAgendaFlagsSchema', () => {
    it('takes a category, a cleared category and the withdrawn flag', () => {
        expect(subjectAgendaFlagsSchema.parse({ nonAgendaReason: 'beforeAgenda' })).toEqual({ nonAgendaReason: 'beforeAgenda' });
        expect(subjectAgendaFlagsSchema.parse({ nonAgendaReason: null, withdrawn: true })).toEqual({ nonAgendaReason: null, withdrawn: true });
    });

    it('refuses an unknown category and an unknown key', () => {
        expect(subjectAgendaFlagsSchema.safeParse({ nonAgendaReason: 'agenda' }).success).toBe(false);
        expect(subjectAgendaFlagsSchema.safeParse({ withdrawn: true, name: 'x' }).success).toBe(false);
    });
});
