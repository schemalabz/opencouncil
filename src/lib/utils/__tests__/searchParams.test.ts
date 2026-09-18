import { firstSearchParam } from '../searchParams';

describe('firstSearchParam', () => {
    it('passes a single value through', () => {
        expect(firstSearchParam('Λάρ')).toBe('Λάρ');
    });

    it('keeps the first value of a repeated parameter, as URLSearchParams does', () => {
        // `?q=a&q=b` is a URL anyone can build; a page that treats the value as
        // a string would otherwise call string methods on an array and crash.
        expect(firstSearchParam(['a', 'b'])).toBe('a');
    });

    it('reads a missing or empty parameter as no search', () => {
        expect(firstSearchParam(undefined)).toBe('');
        expect(firstSearchParam([])).toBe('');
    });
});
