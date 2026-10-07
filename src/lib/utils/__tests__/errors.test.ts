import { errorDetail, errorMessage } from '@/lib/utils/errors';

describe('errorMessage', () => {
    it('returns the message of an Error', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it.each([
        ['a string', 'a bare string', 'a bare string'],
        ['undefined', undefined, 'undefined'],
        ['null', null, 'null'],
        ['a number', 42, '42'],
    ])('stringifies %s without throwing', (_, value, expected) => {
        expect(errorMessage(value)).toBe(expected);
    });
});

describe('errorDetail', () => {
    it('keeps the stack of an Error', () => {
        const error = new Error('boom');
        expect(errorDetail(error)).toBe(error.stack!.trim());
    });

    it('falls back to the message when an Error has no stack', () => {
        const error = new Error('boom');
        error.stack = undefined;
        expect(errorDetail(error)).toBe('boom');
    });

    it('stringifies a non-Error', () => {
        expect(errorDetail(undefined)).toBe('undefined');
    });
});
