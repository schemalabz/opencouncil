import { isClientDisconnectError } from '@/lib/clientDisconnectGuard';

describe('isClientDisconnectError', () => {
    it('flags the cancel error React throws when the destination closes early', () => {
        expect(isClientDisconnectError(new Error('The destination stream closed early.'))).toBe(true);
    });

    it('flags the sibling error React throws when the socket fails mid-write', () => {
        expect(isClientDisconnectError(new Error('The destination stream errored while writing data.'))).toBe(true);
    });

    it('matches a plain object, because an edge-runtime error crosses a realm boundary', () => {
        expect(isClientDisconnectError({ message: 'The destination stream closed early.' })).toBe(true);
    });

    it('lets a real render error through', () => {
        expect(isClientDisconnectError(new Error('Cannot read properties of undefined'))).toBe(false);
    });

    it('matches the message exactly, so a wrapped or extended message still reports', () => {
        expect(isClientDisconnectError(new Error('The destination stream closed early. (city page)'))).toBe(false);
    });

    it('ignores values that carry no string message', () => {
        expect(isClientDisconnectError(null)).toBe(false);
        expect(isClientDisconnectError(undefined)).toBe(false);
        expect(isClientDisconnectError('The destination stream closed early.')).toBe(false);
        expect(isClientDisconnectError({ message: 42 })).toBe(false);
    });
});
