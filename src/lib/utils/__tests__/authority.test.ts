import { AdministrativeBodyType, AuthorityType } from '@prisma/client';
import {
    authorityAllowsBodyType, authorityHasDocument, authorityKey, isRegion, isRegionBodyType,
    proposedOfficialName, proposedOfficialNameEn, REGION_BODY_TYPES,
} from '../authority';

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

describe('the documents of a local authority (#993)', () => {
    it('gives a municipality every document', () => {
        expect(authorityHasDocument({ authorityType: 'municipality' }, 'minutes')).toBe(true);
        expect(authorityHasDocument({ authorityType: 'municipality' }, 'transcript')).toBe(true);
    });

    it('gives a region its transcript and no minutes', () => {
        expect(authorityHasDocument({ authorityType: 'region' }, 'transcript')).toBe(true);
        expect(authorityHasDocument({ authorityType: 'region' }, 'minutes')).toBe(false);
    });
});

describe('the official name that the city form proposes (#993)', () => {
    it('keeps the proposal of a municipality as it was', () => {
        expect(proposedOfficialName('municipality', 'Χανιά')).toBe('Δήμος Χανιά');
        expect(proposedOfficialNameEn('municipality', 'Chania')).toBe('Municipality of Chania');
    });

    it('names a region a region', () => {
        // The form gives the short name, which is in the nominative. A person corrects the case.
        expect(proposedOfficialName('region', 'Θεσσαλία')).toBe('Περιφέρεια Θεσσαλία');
        expect(proposedOfficialNameEn('region', 'Thessaly')).toBe('Region of Thessaly');
    });
});
