import { DEFAULT_AGENDA_HOSTS, analyzeStoredName, isAllowedAgendaUrl, proposeFormat, proposeSessionNumber } from '../meetingRecordBackfill';

const council = { bodyName: 'Δημοτικό Συμβούλιο' };

describe('analyzeStoredName', () => {
    it('proposes cancelled for the three spellings of the archive, and removes the bracket', () => {
        for (const name of [
            '[Ακυρώθηκε] Δημοτικό Συμβούλιο 12/03/2026',
            'Δημοτικό Συμβούλιο 26/08/26 [δεν πραγματοποιήθηκε]',
            'Δημοτικό Συμβούλιο 26/08/26 [Δεν πραγματοποιήθηκε]',
        ]) {
            expect(analyzeStoredName(name, council)).toMatchObject({ proposedStatus: 'cancelled', derivable: true })
        }
        expect(analyzeStoredName('Συνεδρίαση 16/07/26 [Δεν πραγματοποιήθηκε]', { bodyName: '5η Δημοτική Κοινότητα' }))
            .toMatchObject({ proposedStatus: 'cancelled', derivable: true, brackets: ['Δεν πραγματοποιήθηκε'] })
    })

    it('treats a name as derivable when only the date or its format differs', () => {
        expect(analyzeStoredName('Δημοτικό Συμβούλιο 23/03/2025', council).derivable).toBe(true)
        expect(analyzeStoredName('Δημοτικό Συμβούλιο 11/02/25', council).derivable).toBe(true)
        expect(analyzeStoredName(' Δημοτικό Συμβούλιο 12/03/2026', council).derivable).toBe(true)
        expect(analyzeStoredName('Δημοτικό συμβούλιο 22/07/26', council).derivable).toBe(true)
    })

    it('reads the kind from the words of the name', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', council)).toMatchObject({ proposedKind: 'accountability', derivable: true })
        expect(analyzeStoredName('4η Ειδική Συνεδρίαση Λογοδοσίας', council)).toMatchObject({ proposedKind: 'accountability', derivable: true, ordinal: 4 })
        expect(analyzeStoredName('Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', council)).toMatchObject({ proposedKind: 'urgent', derivable: true })
        expect(analyzeStoredName('Έκτακτη Δημοτική Επιτροπή 26/11/25', { bodyName: 'Δημοτική Επιτροπή' })).toMatchObject({ proposedKind: 'urgent', derivable: true })
    })

    it('proposes no kind for a bare «Ειδική Συνεδρίαση»: one name hides four kinds', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', council))
            .toMatchObject({ proposedKind: null, derivable: false, note: 'special-unknown' })
    })

    it('keeps a record of two meetings as an override, without a kind', () => {
        for (const name of [
            'Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26',
            'Ειδική Συνεδρίαση Λογοδοσίας & Τακτική Συνεδρίαση 18/03/26',
            'Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 29/08/25',
        ]) {
            expect(analyzeStoredName(name, council)).toMatchObject({ proposedKind: null, derivable: false, combined: true, cleanedName: name })
        }
    })

    it('marks an interrupted meeting and proposes no status: it took place', () => {
        expect(analyzeStoredName('Δημοτικό Συμβούλιο 20/04/26 [Διεκόπη]', council)).toMatchObject({
            proposedStatus: null, interrupted: true, derivable: true, cleanedName: 'Δημοτικό Συμβούλιο 20/04/26',
        })
    })

    it('keeps a name that says more than body, kind and date, without its brackets', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Απολογισμού για το 2024', council)).toMatchObject({ derivable: false, proposedKind: 'annualReport' })
        expect(analyzeStoredName('Δημοτική - Διαχειριστική Επιτροπή 12/03/26', { bodyName: 'Δημοτική Επιτροπή' })).toMatchObject({ derivable: false })
    })
})

describe('proposeFormat', () => {
    it('reads the format from the words of the invitation', () => {
        expect(proposeFormat('σε τακτική (ΔΙΑ ΖΩΣΗΣ) συνεδρίαση')?.format).toBe('inPerson')
        expect(proposeFormat('θα πραγματοποιηθεί με τηλεδιάσκεψη')?.format).toBe('teleconference')
        expect(proposeFormat('τόσο δια ζώσης όσο και με τηλεδιάσκεψη')?.format).toBe('mixed')
        expect(proposeFormat('Μεικτή συνεδρίαση')?.format).toBe('mixed')
        expect(proposeFormat('συνεδρίαση δια περιφοράς')?.format).toBe('byCirculation')
        expect(proposeFormat('στην αίθουσα του Δημοτικού Συμβουλίου')).toBeNull()
    })

    it('returns the sentence it read, for the reviewer', () => {
        expect(proposeFormat('Καλείστε σε συνεδρίαση που θα γίνει με τηλεδιάσκεψη μέσω TEAMS.')?.evidence).toContain('τηλεδιάσκεψη')
    })
})

describe('proposeSessionNumber', () => {
    it('reads the number in the four formats that the research found reliable', () => {
        expect(proposeSessionNumber('athens', 'Σας προσκαλούμε να συμμετέχετε στην 15η Συνεδρίαση του Σώματος')?.number).toBe(15)
        expect(proposeSessionNumber('athens', 'της 14ης Ειδικής Συνεδρίασης Λογοδοσίας')?.number).toBe(14)
        expect(proposeSessionNumber('vrilissia', 'ΠΡΟΣΚΛΗΣΗ Για την 12η/2026 Τακτική Συνεδρίαση')?.number).toBe(12)
        expect(proposeSessionNumber('samothraki', 'για την 11η ΕΚΤΑΚΤΗ ΔΗΜΟΣΙΑ ΣΥΝΕΔΡΙΑΣΗ')?.number).toBe(11)
        expect(proposeSessionNumber('zografou', 'Σας προσκαλούμε σε ΤΑΚΤΙΚΗ ΣΥΝΕΔΡΙΑΣΗ (3η) του Δημοτικού Συμβουλίου')?.number).toBe(3)
    })

    it('proposes nothing for a city whose invitation number is not the session number', () => {
        expect(proposeSessionNumber('sparta', 'ΠΡΟΣΚΛΗΣΗ (Αριθ.48/2025) Καλείστε σε τακτική δημόσια συνεδρίαση')).toBeNull()
        expect(proposeSessionNumber('chalandri', '12η ΕΚΤΑΚΤΗ ΠΡΟΣΚΛΗΣΗ ΤΩΝ ΜΕΛΩΝ ΤΟΥ ΔΗΜΟΤΙΚΟΥ ΣΥΜΒΟΥΛΙΟΥ')).toBeNull()
    })

    it('never reads a date or a community for a number', () => {
        expect(proposeSessionNumber('athens', 'στα γραφεία της 3ης Δημοτικής Κοινότητας την 24η Φεβρουαρίου')).toBeNull()
    })
})

describe('isAllowedAgendaUrl', () => {
    it('allows an https URL on the uploads bucket', () => {
        expect(isAllowedAgendaUrl('https://townhalls-gr.fra1.digitaloceanspaces.com/uploads/athens_sep23_2026_agenda.pdf', DEFAULT_AGENDA_HOSTS)).toBe(true);
    });

    it('refuses other hosts, plain http, internal addresses and junk', () => {
        for (const url of [
            'http://townhalls-gr.fra1.digitaloceanspaces.com/a.pdf',
            'https://169.254.169.254/latest/meta-data.pdf',
            'https://localhost/a.pdf',
            'https://townhalls-gr.fra1.digitaloceanspaces.com:8443/a.pdf',
            'https://townhalls-gr.fra1.digitaloceanspaces.com.evil.example/a.pdf',
            'not a url.pdf',
        ]) {
            expect(isAllowedAgendaUrl(url, DEFAULT_AGENDA_HOSTS)).toBe(false);
        }
    });
});
