import { updateProfileSchema } from '../user';

function phoneIssue(input: unknown): string | undefined {
    const result = updateProfileSchema.safeParse({ phone: input });
    if (result.success) return undefined;
    return result.error.issues.find((issue) => issue.path[0] === 'phone')?.message;
}

describe('updateProfileSchema.phone', () => {
    it('canonicalizes a mobile number to E.164', () => {
        const result = updateProfileSchema.safeParse({ phone: ' +30 694 347 2297 ' });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ phone: '+306943472297' });
    });

    it('repairs the legacy shape — a Greek mobile behind a bare plus', () => {
        const result = updateProfileSchema.safeParse({ phone: '+6943472297' });
        expect(result.data).toEqual({ phone: '+306943472297' });
    });

    it('keeps null as "no phone" and leaves an omitted field alone', () => {
        expect(updateProfileSchema.safeParse({ phone: null }).data).toEqual({ phone: null });
        expect(updateProfileSchema.safeParse({ name: 'Μαρία' }).data).toEqual({ name: 'Μαρία' });
    });

    it('answers with a code the form can translate', () => {
        expect(phoneIssue('')).toBe('phone_empty');
        expect(phoneIssue('+302106459454')).toBe('phone_not_mobile');
        expect(phoneIssue('+4074101434')).toBe('phone_invalid');
        expect(phoneIssue('6943')).toBe('phone_invalid');
    });
});
