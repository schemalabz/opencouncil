import { storedCallbackUrl } from '../storedCallbackUrl';

const BASE = 'https://opencouncil.gr';

describe('storedCallbackUrl', () => {
    it('turns a same-origin absolute URL back into a path with its query', () => {
        expect(storedCallbackUrl('https://opencouncil.gr/athens/notifications?step=2', BASE)).toBe('/athens/notifications?step=2');
        expect(storedCallbackUrl('/mcp', BASE)).toBe('/mcp');
    });

    it('keeps a trusted other host absolute', () => {
        expect(storedCallbackUrl('https://notis.opencouncil.gr/admin', BASE)).toBe('https://notis.opencouncil.gr/admin');
    });

    it('drops anything else', () => {
        expect(storedCallbackUrl('https://evil.example.com/x', BASE)).toBeNull();
        expect(storedCallbackUrl(undefined, BASE)).toBeNull();
        expect(storedCallbackUrl('', BASE)).toBeNull();
    });
});
