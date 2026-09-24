import { parseDiavgeiaUnitScope, parseDiavgeiaUnitScopes, entriesForResolvedUnit, readDiavgeiaUnitEntries } from '@/lib/utils/diavgeiaUnitScope';

describe('parseDiavgeiaUnitScopes', () => {
    it('reads a bare unit as unit-only', () => {
        expect(parseDiavgeiaUnitScopes(['81689'])).toEqual([{ unit: '81689' }]);
    });

    it('reads unit:signer as a pair', () => {
        expect(parseDiavgeiaUnitScopes(['84655:100010590'])).toEqual([
            { unit: '84655', signer: '100010590' },
        ]);
    });

    it('keeps bare and scoped entries side by side', () => {
        expect(parseDiavgeiaUnitScopes(['81689', '84655:100022189'])).toEqual([
            { unit: '81689' },
            { unit: '84655', signer: '100022189' },
        ]);
    });

    it('trims whitespace around either part', () => {
        expect(parseDiavgeiaUnitScopes([' 84655 : 100010590 '])).toEqual([
            { unit: '84655', signer: '100010590' },
        ]);
    });

    it('skips blank entries', () => {
        expect(parseDiavgeiaUnitScopes(['81689', '', '  '])).toEqual([{ unit: '81689' }]);
    });

    it('throws on a malformed entry instead of narrowing the poll silently', () => {
        expect(() => parseDiavgeiaUnitScopes(['84655:100:extra'])).toThrow(/Malformed/);
        expect(() => parseDiavgeiaUnitScopes([':100010590'])).toThrow(/Malformed/);
    });

    it('treats an empty signer part as unit-only', () => {
        expect(parseDiavgeiaUnitScopes(['84655:'])).toEqual([{ unit: '84655' }]);
    });

    it('returns nothing for an empty or absent configuration', () => {
        expect(parseDiavgeiaUnitScopes([])).toEqual([]);
        expect(parseDiavgeiaUnitScopes(null)).toEqual([]);
        expect(parseDiavgeiaUnitScopes(undefined)).toEqual([]);
    });
});

describe('parseDiavgeiaUnitScope', () => {
    it('parses a single entry of either shape', () => {
        expect(parseDiavgeiaUnitScope('81689')).toEqual({ unit: '81689' });
        expect(parseDiavgeiaUnitScope('84655:129415')).toEqual({ unit: '84655', signer: '129415' });
    });

    it('returns null for a blank entry and throws when a unit is missing', () => {
        expect(parseDiavgeiaUnitScope('')).toBeNull();
        expect(() => parseDiavgeiaUnitScope(':129415')).toThrow(/Malformed/);
    });
});

describe('entriesForResolvedUnit', () => {
    it('writes the resolved unit when the body has no configuration', () => {
        expect(entriesForResolvedUnit([], '81689')).toEqual(['81689']);
        expect(entriesForResolvedUnit(null, '81689')).toEqual(['81689']);
    });

    it('keeps a signer suffix when it re-resolves to the same unit', () => {
        expect(entriesForResolvedUnit(['84655:100010590'], '84655')).toEqual(['84655:100010590']);
    });

    it('keeps every signer configured on that unit', () => {
        expect(entriesForResolvedUnit(['84655:100022189', '84655:129415'], '84655')).toEqual([
            '84655:100022189',
            '84655:129415',
        ]);
    });

    it('drops entries for other units, which this resolution does not describe', () => {
        expect(entriesForResolvedUnit(['81689', '84655:129415'], '84655')).toEqual(['84655:129415']);
    });

    it('overwrites when it resolves to a different unit', () => {
        expect(entriesForResolvedUnit(['84655:100010590'], '81689')).toEqual(['81689']);
    });

    it('is a no-op for a bare entry that already matches', () => {
        expect(entriesForResolvedUnit(['81689'], '81689')).toEqual(['81689']);
    });
});

describe('readDiavgeiaUnitEntries', () => {
    it('reads every well-formed entry, keeping the text it was configured as', () => {
        expect(readDiavgeiaUnitEntries(['81689', '84655:129415'])).toEqual([
            { entry: '81689', scope: { unit: '81689' }, error: null },
            { entry: '84655:129415', scope: { unit: '84655', signer: '129415' }, error: null },
        ]);
    });

    it('reports a malformed entry instead of throwing', () => {
        const [only] = readDiavgeiaUnitEntries(['81689:129415:extra']);
        expect(only.scope).toBeNull();
        expect(only.error).toContain('81689:129415:extra');
    });

    it('marks only the malformed entry, leaving the valid ones beside it readable', () => {
        // The whole point of reading per entry: one typo must not hide a
        // configured scope from the admin looking at it.
        const read = readDiavgeiaUnitEntries(['81689', 'bad:1:2', '84655:129415']);
        expect(read.map(r => r.scope !== null)).toEqual([true, false, true]);
        expect(read.filter(r => r.scope).map(r => r.entry)).toEqual(['81689', '84655:129415']);
    });

    it('skips a blank entry rather than reporting it', () => {
        expect(readDiavgeiaUnitEntries(['81689', '  '])).toEqual([
            { entry: '81689', scope: { unit: '81689' }, error: null },
        ]);
    });

    it('reads an unset configuration as no entries', () => {
        expect(readDiavgeiaUnitEntries(undefined)).toEqual([]);
    });
});
