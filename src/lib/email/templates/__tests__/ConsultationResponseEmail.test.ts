import { consultationResponseCopy } from '../ConsultationResponseEmail';

describe('consultationResponseCopy', () => {
    it('tells the parties to continue by replying to everyone', () => {
        expect(consultationResponseCopy('el').continueOutside).toBe(
            'Η συζήτηση δεν μπορεί να συνεχιστεί μέσα στην πλατφόρμα της διαβούλευσης. Μπορείτε όμως να τη συνεχίσετε μεταξύ σας, απαντώντας σε όλους σε αυτό το email.'
        );
    });

    it('names the consultation in the subject and the municipality in the intro', () => {
        const copy = consultationResponseCopy('el');
        expect(copy.subject('ΣΕΣ')).toBe('Απάντηση του Δήμου στο σχόλιό σας — «ΣΕΣ»');
        expect(copy.intro('Δήμος Παπάγου - Χολαργού', 'ΣΕΣ', 'Βουτσινά, δεξιά πλευρά'))
            .toBe('Ο Δήμος Παπάγου - Χολαργού απάντησε στο σχόλιο που αφήσατε στη διαβούλευση «ΣΕΣ», για «Βουτσινά, δεξιά πλευρά».');
        expect(copy.intro('Δήμος Παπάγου - Χολαργού', 'ΣΕΣ', null))
            .toBe('Ο Δήμος Παπάγου - Χολαργού απάντησε στο σχόλιο που αφήσατε στη διαβούλευση «ΣΕΣ».');
        expect(copy.greeting(null)).toBe('Γεια σας,');
    });

    it('falls back to Greek for a locale without copy', () => {
        expect(consultationResponseCopy('en').heading).toBe(consultationResponseCopy('el').heading);
        expect(consultationResponseCopy('fr').heading).not.toBe(consultationResponseCopy('el').heading);
    });
});
