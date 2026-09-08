import { formatError } from './errors';

describe('formatError', () => {
    test('prints the message of an Error', () => {
        expect(formatError(new Error('boom'))).toBe('boom');
    });
    test('prints a value that is not an Error', () => {
        expect(formatError('plain text')).toBe('plain text');
    });
    test('prints the code and the inner errors of an AggregateError with an empty message', () => {
        // node-postgres rejects a refused connection like this.
        const inner = [
            Object.assign(new Error('connect ECONNREFUSED ::1:1'), { code: 'ECONNREFUSED' }),
            Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }),
        ];
        const error = Object.assign(new AggregateError(inner, ''), { code: 'ECONNREFUSED' });
        expect(formatError(error)).toBe('AggregateError: ECONNREFUSED\n  connect ECONNREFUSED ::1:1\n  connect ECONNREFUSED 127.0.0.1:1');
    });
    test('falls back to the name when an error has no message and no code', () => {
        expect(formatError(new TypeError(''))).toBe('TypeError');
    });
    test('prints the cause chain', () => {
        const root = new Error('spawn nix ENOENT');
        const error = new Error('nix is not on PATH', { cause: new Error('the build failed', { cause: root }) });
        expect(formatError(error)).toBe('nix is not on PATH\ncaused by: the build failed\ncaused by: spawn nix ENOENT');
    });
    test('skips a cause whose message the text already holds', () => {
        const cause = new Error('relation "x" does not exist');
        expect(formatError(new Error(`re-adding foreign key "fk" failed: ${cause.message}`, { cause }))).toBe('re-adding foreign key "fk" failed: relation "x" does not exist');
    });
    test('stops at a cause cycle', () => {
        const error = new Error('a');
        const other = new Error('b', { cause: error });
        Object.assign(error, { cause: other });
        expect(formatError(error)).toBe('a\ncaused by: b');
    });
    test('prints unknown error for undefined, never an empty string', () => {
        expect(formatError(undefined)).toBe('unknown error');
    });
    test('falls back to unknown error when the message is only whitespace and there is no name', () => {
        expect(formatError({ message: '   ' })).toBe('unknown error');
    });
    test('skips a cause whose message is only whitespace and keeps the top headline', () => {
        const error = new Error('top', { cause: { message: '  ' } });
        expect(formatError(error)).toBe('top');
    });
});
