import { AdministrativeBodyType, AuthorityType } from '@prisma/client';
import { authorityAllowsBodyType, authorityKey, isRegion, isRegionBodyType, REGION_BODY_TYPES } from '../authority';

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

    it.each(Object.values(AdministrativeBodyType))('lets a municipality have a %s', type => {
        expect(authorityAllowsBodyType({ authorityType: 'municipality' }, type)).toBe(true);
    });

    it.each([
        ['council', true],
        ['committee', true],
        ['community', false],
        ['youthCouncil', false],
    ] as const)('a region and a %s: allowed %s', (type, allowed) => {
        expect(authorityAllowsBodyType({ authorityType: 'region' }, type)).toBe(allowed);
        expect(isRegionBodyType(type)).toBe(allowed);
    });

    it('covers every body type in the two cases above', () => {
        expect(Object.values(AdministrativeBodyType).sort()).toEqual(['committee', 'community', 'council', 'youthCouncil']);
        expect([...REGION_BODY_TYPES]).toEqual(['council', 'committee']);
    });
});
