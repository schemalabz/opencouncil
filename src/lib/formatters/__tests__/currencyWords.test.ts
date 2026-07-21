import { euroAmountInWords } from '../currencyWords';

describe('euroAmountInWords', () => {
    it('matches the wording used in real offer documents', () => {
        // From the Vrilissia Οικονομική Προσφορά
        expect(euroAmountInWords(15200)).toBe('Δεκαπέντε Χιλιάδες Διακόσια Ευρώ');
        expect(euroAmountInWords(18848)).toBe('Δεκαοκτώ Χιλιάδες Οκτακόσια Σαράντα Οκτώ Ευρώ');
    });

    it('handles round totals', () => {
        expect(euroAmountInWords(12600)).toBe('Δώδεκα Χιλιάδες Εξακόσια Ευρώ');
        expect(euroAmountInWords(15624)).toBe('Δεκαπέντε Χιλιάδες Εξακόσια Είκοσι Τέσσερα Ευρώ');
        expect(euroAmountInWords(2000)).toBe('Δύο Χιλιάδες Ευρώ');
        expect(euroAmountInWords(1000)).toBe('Χίλια Ευρώ');
        expect(euroAmountInWords(900)).toBe('Εννιακόσια Ευρώ');
        expect(euroAmountInWords(100)).toBe('Εκατό Ευρώ');
        expect(euroAmountInWords(101)).toBe('Εκατόν Ένα Ευρώ');
    });

    it('handles cents', () => {
        expect(euroAmountInWords(12055.5)).toBe(
            'Δώδεκα Χιλιάδες Πενήντα Πέντε Ευρώ και Πενήντα Λεπτά'
        );
        expect(euroAmountInWords(0.01)).toBe('Μηδέν Ευρώ και Ένα Λεπτό');
        expect(euroAmountInWords(1.25)).toBe('Ένα Ευρώ και Είκοσι Πέντε Λεπτά');
    });

    it('uses feminine forms for thousands', () => {
        expect(euroAmountInWords(3000)).toBe('Τρεις Χιλιάδες Ευρώ');
        expect(euroAmountInWords(4000)).toBe('Τέσσερις Χιλιάδες Ευρώ');
        expect(euroAmountInWords(13000)).toBe('Δεκατρείς Χιλιάδες Ευρώ');
        expect(euroAmountInWords(200000)).toBe('Διακόσιες Χιλιάδες Ευρώ');
        expect(euroAmountInWords(21000)).toBe('Είκοσι Μία Χιλιάδες Ευρώ');
    });

    it('handles millions and zero', () => {
        expect(euroAmountInWords(1000000)).toBe('Ένα Εκατομμύριο Ευρώ');
        expect(euroAmountInWords(2500000)).toBe(
            'Δύο Εκατομμύρια Πεντακόσιες Χιλιάδες Ευρώ'
        );
        expect(euroAmountInWords(0)).toBe('Μηδέν Ευρώ');
    });
});
