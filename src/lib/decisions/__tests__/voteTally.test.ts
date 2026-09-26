import { parseVoteTally } from '../voteTally';

describe('parseVoteTally', () => {
    it('reads a for/against split', () => {
        expect(parseVoteTally('Κατά πλειοψηφία με ψήφους 21 υπέρ και 2 κατά')).toEqual({ for: 21, against: 2, blank: null });
        expect(parseVoteTally('Κατά πλειοψηφία με 17 ψήφους υπέρ και 7 κατά')).toEqual({ for: 17, against: 7, blank: null });
    });
    it('reads a bracketed number word', () => {
        expect(parseVoteTally('Με δεκαέξι (16) θετικές ψήφους')).toEqual({ for: 16, against: null, blank: null });
        expect(parseVoteTally('Εγκρίνεται με ΥΠΕΡ: 10 ψήφους')).toEqual({ for: 10, against: null, blank: null });
    });
    it('does not mistake a member count or a bare phrase for a tally', () => {
        expect(parseVoteTally('με την απόλυτη πλειοψηφία των τριών (3) μελών της που ήταν παρόντα και ψήφισαν υπέρ')).toEqual({ for: null, against: null, blank: null });
        expect(parseVoteTally('Ομόφωνα')).toEqual({ for: null, against: null, blank: null });
        expect(parseVoteTally(null)).toEqual({ for: null, against: null, blank: null });
    });
});
