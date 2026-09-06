import { buildPetitionSubmission, initialPetitionState, petitionIssues, type PetitionState } from '../petition-state';

const account = { name: 'Μαρία', email: 'maria@example.com', phone: '+306900000001' };

describe('initialPetitionState', () => {
    it('starts empty for a new reader and prefilled for one who signed before', () => {
        expect(initialPetitionState({ initialStep: 1, existing: null, account: null })).toEqual({
            step: 1,
            isResident: false,
            isCitizen: false,
            name: '',
            email: '',
            phone: '',
        });
        expect(
            initialPetitionState({ initialStep: 2, existing: { isResident: true, isCitizen: false }, account }),
        ).toMatchObject({ step: 2, isResident: true, isCitizen: false, name: 'Μαρία', email: 'maria@example.com' });
    });
});

describe('petitionIssues', () => {
    const base: PetitionState = { step: 2, isResident: true, isCitizen: false, name: 'Μαρία', email: 'maria@example.com', phone: '' };
    const ok = { phoneEmpty: true, phoneValid: false, signedIn: false };

    it('needs at least one relation to the municipality', () => {
        expect(petitionIssues(base, ok)).toEqual([]);
        expect(petitionIssues({ ...base, isResident: false }, ok)).toEqual(['relation_missing']);
    });

    it('needs the account fields from a signed-out reader only', () => {
        const anonymous = { ...base, name: '', email: 'nope' };
        expect(petitionIssues(anonymous, ok)).toEqual(['name_missing', 'email_invalid']);
        expect(petitionIssues(anonymous, { ...ok, signedIn: true })).toEqual([]);
    });

    it('accepts an empty phone and refuses a wrong one', () => {
        expect(petitionIssues(base, { phoneEmpty: true, phoneValid: false, signedIn: false })).toEqual([]);
        expect(petitionIssues(base, { phoneEmpty: false, phoneValid: false, signedIn: false })).toEqual(['phone_invalid']);
        expect(petitionIssues(base, { phoneEmpty: false, phoneValid: true, signedIn: false })).toEqual([]);
    });
});

describe('buildPetitionSubmission', () => {
    const state: PetitionState = {
        step: 2,
        isResident: false,
        isCitizen: true,
        name: ' Μαρία ',
        email: ' maria@example.com ',
        phone: '+30 694 3472297',
    };

    it('sends the account fields when signed out, and the phone only when one was typed', () => {
        expect(buildPetitionSubmission(state, 'thessaloniki', false, false)).toEqual({
            cityId: 'thessaloniki',
            isResident: false,
            isCitizen: true,
            name: 'Μαρία',
            email: 'maria@example.com',
            phone: '+30 694 3472297',
        });
        expect(buildPetitionSubmission({ ...state, phone: '+30' }, 'thessaloniki', false, true)).not.toHaveProperty('phone');
    });

    it('sends only the relation when signed in', () => {
        expect(buildPetitionSubmission(state, 'thessaloniki', true, true)).toEqual({
            cityId: 'thessaloniki',
            isResident: false,
            isCitizen: true,
        });
    });
});
