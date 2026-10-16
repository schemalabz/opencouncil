import { chipStyle } from '../DocumentChips';

describe('chipStyle', () => {
    it('colours a wait that only an operator can end', () => {
        expect(chipStyle('waiting', true).iconClassName).toBe('text-amber-600');
    });

    it('keeps an ordinary wait muted', () => {
        expect(chipStyle('waiting', false).iconClassName).toBe('text-muted-foreground');
    });

    it('keeps a transcript left unsent by choice muted, and colours an overdue document', () => {
        expect(chipStyle('unsent', false).iconClassName).toBe('text-muted-foreground');
        expect(chipStyle('unsent', true).iconClassName).toBe('text-amber-600');
    });
});
