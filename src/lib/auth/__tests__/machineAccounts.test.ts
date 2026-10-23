import { isMachineAccountAddress, machineAccountAddress, machineAccountSlug } from '../machineAccounts';

describe('machineAccountSlug', () => {
    it.each([
        ['Paola', 'paola'],
        ['  Athens bot  ', 'athens-bot'],
        ['Tasks server (prod)', 'tasks-server-prod'],
        ['A--B__C', 'a-b-c'],
        ['Παόλα 2', '2'],
    ])('%j → %j', (label, slug) => {
        expect(machineAccountSlug(label)).toBe(slug);
    });

    it('is null when no Latin letter or digit is left', () => {
        expect(machineAccountSlug('')).toBeNull();
        expect(machineAccountSlug('---')).toBeNull();
        expect(machineAccountSlug('Παόλα')).toBeNull();
    });
});

describe('machine addresses', () => {
    it('builds the address on the reserved domain', () => {
        expect(machineAccountAddress('paola')).toBe('paola@machines.opencouncil.invalid');
    });

    it('recognises the domain whatever the case or the spacing', () => {
        expect(isMachineAccountAddress('paola@machines.opencouncil.invalid')).toBe(true);
        expect(isMachineAccountAddress('  Paola@Machines.OpenCouncil.Invalid ')).toBe(true);
        expect(isMachineAccountAddress('paola@opencouncil.gr')).toBe(false);
        expect(isMachineAccountAddress('machines.opencouncil.invalid@example.com')).toBe(false);
        expect(isMachineAccountAddress(null)).toBe(false);
        expect(isMachineAccountAddress(undefined)).toBe(false);
    });
});
