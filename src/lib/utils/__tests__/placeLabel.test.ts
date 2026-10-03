import { splitPlaceText } from '../placeLabel';

describe('splitPlaceText', () => {
    it('names the place first and drops the country', () => {
        expect(splitPlaceText('Ευαγγελιστρίας 12, Φηρά 847 00, Ελλάδα')).toEqual({
            primary: 'Ευαγγελιστρίας 12',
            secondary: 'Φηρά 847 00',
        });
    });

    it('keeps every middle part', () => {
        expect(splitPlaceText('Φηρά, Θήρα, Κυκλάδες, Ελλάδα')).toEqual({ primary: 'Φηρά', secondary: 'Θήρα, Κυκλάδες' });
    });

    it('has no second line when only the country follows', () => {
        expect(splitPlaceText('Καρτεράδος, Ελλάδα')).toEqual({ primary: 'Καρτεράδος', secondary: '' });
    });

    it('keeps a text with no commas whole', () => {
        expect(splitPlaceText('Κουκάκι')).toEqual({ primary: 'Κουκάκι', secondary: '' });
    });
});
