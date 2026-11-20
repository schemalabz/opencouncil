import { AuthorityType } from '@prisma/client';
import { authorityKey, isRegion } from '../authority';

describe('the kind of a local authority (#993)', () => {
    it.each([
        ['a municipality', false, { authorityType: AuthorityType.municipality }],
        ['a region', true, { authorityType: AuthorityType.region }],
    ])('%s: is a region %s', (_name, region, city) => {
        expect(isRegion(city)).toBe(region);
    });

    it('reads no city as not a region', () => {
        expect(isRegion(null)).toBe(false);
        expect(isRegion(undefined)).toBe(false);
    });

    it.each(Object.values(AuthorityType))('picks the %s variant of a message', authorityType => {
        expect(authorityKey('introTitle', { authorityType })).toBe(`introTitle.${authorityType}`);
    });
});
