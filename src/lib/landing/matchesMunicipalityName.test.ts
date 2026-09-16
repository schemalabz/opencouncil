import { matchesMunicipalityName } from './landingData';

describe('matchesMunicipalityName', () => {
    it('matches everything on an empty or blank query', () => {
        expect(matchesMunicipalityName('', 'Χαλάνδρι')).toBe(true);
        expect(matchesMunicipalityName('   ', 'Χαλάνδρι')).toBe(true);
    });

    it('matches a substring of the name regardless of accents and case', () => {
        expect(matchesMunicipalityName('χαλαν', 'Χαλάνδρι')).toBe(true);
        expect(matchesMunicipalityName('ΧΑΛΆΝ', 'Χαλάνδρι')).toBe(true);
        expect(matchesMunicipalityName('ανδρι', 'Χαλάνδρι')).toBe(true);
    });

    it('matches any of the names the δήμος goes by', () => {
        expect(matchesMunicipalityName('αθηναιων', 'Αθήνα', 'Δήμος Αθηναίων')).toBe(true);
        expect(matchesMunicipalityName('athens', 'Αθήνα', 'Δήμος Αθηναίων', 'Athens')).toBe(true);
        expect(matchesMunicipalityName('ψυχικο', 'Φιλοθέη - Ψυχικό', 'Δήμος Φιλοθέης - Ψυχικού')).toBe(true);
    });

    it('rejects a query no name contains, and skips missing names', () => {
        expect(matchesMunicipalityName('σπαρτη', 'Χαλάνδρι', 'Δήμος Χαλανδρίου')).toBe(false);
        expect(matchesMunicipalityName('σπαρτη', null, undefined)).toBe(false);
    });
});
