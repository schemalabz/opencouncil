import {
    subjectListQuerySchema,
    meetingSubjectListQuerySchema,
    DEFAULT_SUBJECT_LIMIT,
    MAX_SUBJECT_LIMIT,
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

    it('parses the date range into Date objects', () => {
        const parsed = subjectListQuerySchema.parse({ from: '2025-01-01', to: '2025-12-31' });
        expect(parsed.from).toEqual(new Date('2025-01-01T00:00:00.000Z'));
        // The upper bound covers the whole day. Midnight at the start of the
        // 31st would drop every meeting held on the 31st.
        expect(parsed.to).toEqual(new Date('2025-12-31T23:59:59.999Z'));
    });

    it('keeps a full timestamp in the upper bound as written', () => {
        const parsed = subjectListQuerySchema.parse({ to: '2025-12-31T09:00:00.000Z' });
        expect(parsed.to).toEqual(new Date('2025-12-31T09:00:00.000Z'));
    });

    it('rejects an unparseable date', () => {
        expect(() => subjectListQuerySchema.parse({ from: 'yesterday' })).toThrow(/Invalid 'from' date/);
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

    it('treats includeUnreleased as true only for the exact string', () => {
        expect(subjectListQuerySchema.parse({ includeUnreleased: 'true' }).includeUnreleased).toBe(true);
        expect(subjectListQuerySchema.parse({ includeUnreleased: '1' }).includeUnreleased).toBe(false);
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
