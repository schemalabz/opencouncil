import { matchSpeakerNameToPerson } from '../speakerMatch';

describe('matchSpeakerNameToPerson', () => {
    const people = [
        { id: 'p1', name: 'Μαρία Ευαγγελίδου' },
        { id: 'p2', name: 'Νίκος Τουσιάς' },
        { id: 'p3', name: 'Γιώργος Παπαδόπουλος' },
    ];

    it('matches role-prefixed last name to correct person', () => {
        expect(matchSpeakerNameToPerson('Αντιδήμαρχος Ευαγγελίδου', people)).toBe('p1');
    });

    it('matches full name', () => {
        expect(matchSpeakerNameToPerson('Νίκος Τουσιάς', people)).toBe('p2');
    });

    it('matches last name only', () => {
        expect(matchSpeakerNameToPerson('Παπαδόπουλος', people)).toBe('p3');
    });

    it('returns null for empty string', () => {
        expect(matchSpeakerNameToPerson('', people)).toBeNull();
    });

    it('returns null for short tokens only', () => {
        // All tokens < 3 chars
        expect(matchSpeakerNameToPerson('Α Β', people)).toBeNull();
    });

    it('returns null when no match found', () => {
        expect(matchSpeakerNameToPerson('Δήμαρχος Αγγελόπουλος', people)).toBeNull();
    });

    it('returns null for ambiguous match (multiple people share a token)', () => {
        const peopleWithSharedToken = [
            { id: 'p1', name: 'Νίκος Ευαγγελίδης' },
            { id: 'p2', name: 'Μαρία Ευαγγελίδου' },
        ];
        // "Ευαγγελίδου" does not match "Ευαγγελίδης" (exact token match)
        // so this should match only p2
        expect(matchSpeakerNameToPerson('Αντιδήμαρχος Ευαγγελίδου', peopleWithSharedToken)).toBe('p2');
    });

    it('returns null when multiple people match the same token', () => {
        const peopleWithDuplicate = [
            { id: 'p1', name: 'Νίκος Παπαδόπουλος' },
            { id: 'p2', name: 'Μαρία Παπαδόπουλος' },
        ];
        // Both share "Παπαδόπουλος" token — ambiguous
        expect(matchSpeakerNameToPerson('Αντιδήμαρχος Παπαδόπουλος', peopleWithDuplicate)).toBeNull();
    });

    it('returns null with empty people list', () => {
        expect(matchSpeakerNameToPerson('Αντιδήμαρχος Ευαγγελίδου', [])).toBeNull();
    });

    it('is case-insensitive', () => {
        const upperPeople = [
            { id: 'p1', name: 'ΜΑΡΊΑ ΕΥΑΓΓΕΛΊΔΟΥ' },
        ];
        expect(matchSpeakerNameToPerson('αντιδήμαρχος ευαγγελίδου', upperPeople)).toBe('p1');
    });
});
