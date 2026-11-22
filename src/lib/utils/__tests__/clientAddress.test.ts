import { addressGroup, connectingAddress } from '../clientAddress.cjs';

describe('connectingAddress', () => {
    it("reads App Platform's header and never X-Forwarded-For", () => {
        const headers: Record<string, string> = { 'do-connecting-ip': ' 203.0.113.7 ', 'x-forwarded-for': '198.51.100.66' };
        expect(connectingAddress(name => headers[name])).toBe('203.0.113.7');
        expect(connectingAddress(name => ({ 'x-forwarded-for': '198.51.100.66' } as Record<string, string>)[name])).toBeUndefined();
        expect(connectingAddress(() => ['2001:db8::1', '203.0.113.7'])).toBe('2001:db8::1');
    });
});

describe('addressGroup', () => {
    it('keeps an IPv4 address as it is', () => {
        expect(addressGroup('2.86.26.139')).toBe('2.86.26.139');
        expect(addressGroup('47.128.44.19')).not.toBe(addressGroup('47.128.44.127'));
    });

    it('gives every address of one IPv6 /64 block the same key, in any notation', () => {
        const key = addressGroup('2a02:586:8722:d100:ece7:8c2f:b619:4a04');
        expect(key).toBe('2a02:586:8722:d100::/64');
        expect(addressGroup('2a02:586:8722:d100::1')).toBe(key);
        expect(addressGroup('2A02:0586:8722:D100:0:0:0:FFFF')).toBe(key);
        expect(addressGroup('2a02:586:8722:d100::')).toBe(key);
    });

    it('tells apart two /64 blocks, also when the address is compressed', () => {
        // Meta's crawler, as staging recorded it: a new address for every request.
        expect(addressGroup('2a03:2880:f806::')).toBe('2a03:2880:f806:0::/64');
        expect(addressGroup('2a03:2880:f808:9::')).toBe('2a03:2880:f808:9::/64');
        expect(addressGroup('::')).toBe('0:0:0:0::/64');
        expect(addressGroup('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    });

    it('reads IPv4 written as IPv6 as IPv4, and dotted IPv4 at the end of an IPv6 address', () => {
        expect(addressGroup('::ffff:2.86.26.139')).toBe('2.86.26.139');
        expect(addressGroup('::FFFF:2.86.26.139')).toBe('2.86.26.139');
        expect(addressGroup('64:ff9b:1:2::192.0.2.1')).toBe('64:ff9b:1:2::/64');
    });

    it('keeps any other value as it is', () => {
        expect(addressGroup('not an address')).toBe('not an address');
        expect(addressGroup('999.1.1.1')).toBe('999.1.1.1');
    });
});
