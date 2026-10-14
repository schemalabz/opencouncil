import type { MeetingKind } from '@prisma/client';
import { analyzeStoredName, storedNameLoss } from '../meetingRecordBackfill';

const council = { bodyName: 'Δημοτικό Συμβούλιο' };

/** Whether the derived name of the record says all that the stored name says. */
const holds = (name: string, record: { kind: MeetingKind | null; urgent?: boolean; sessionNumber?: number | null }, body = council) =>
    storedNameLoss(analyzeStoredName(name, body), { urgent: false, sessionNumber: null, ...record }) === null

describe('analyzeStoredName', () => {
    it('proposes cancelled for the three spellings of the archive, which no name needs to keep', () => {
        for (const name of [
            '[Ακυρώθηκε] Δημοτικό Συμβούλιο 12/03/2026',
            'Δημοτικό Συμβούλιο 26/08/26 [δεν πραγματοποιήθηκε]',
            'Δημοτικό Συμβούλιο 26/08/26 [Δεν πραγματοποιήθηκε]',
        ]) {
            expect(analyzeStoredName(name, council)).toMatchObject({ proposedStatus: 'cancelled', unmappedBrackets: [] })
            expect(holds(name, { kind: 'ordinary' })).toBe(true)
        }
        expect(analyzeStoredName('Συνεδρίαση 16/07/26 [Δεν πραγματοποιήθηκε]', { bodyName: '5η Δημοτική Κοινότητα' }))
            .toMatchObject({ proposedStatus: 'cancelled', brackets: ['Δεν πραγματοποιήθηκε'] })
    })

    it('reads «[Ματαιώθηκε]», the word of the law, as cancelled too', () => {
        expect(analyzeStoredName('Δημοτικό Συμβούλιο 12/03/2026 [Ματαιώθηκε]', council)).toMatchObject({ proposedStatus: 'cancelled', unmappedBrackets: [] })
    })

    it('loses nothing to a derived name that differs only in the date or its format', () => {
        expect(holds('Δημοτικό Συμβούλιο 23/03/2025', { kind: 'ordinary' })).toBe(true)
        expect(holds('Δημοτικό Συμβούλιο 11/02/25', { kind: 'ordinary' })).toBe(true)
        expect(holds(' Δημοτικό Συμβούλιο 12/03/2026', { kind: 'ordinary' })).toBe(true)
        // The label prints the body and the date around «Συνεδρίαση 12/03/2026».
        expect(holds('Δημοτικό Συμβούλιο 12/03/2026', { kind: null })).toBe(true)
        expect(holds('Συνεδρίαση 16/07/26', { kind: null }, { bodyName: '5η Δημοτική Κοινότητα' })).toBe(true)
        expect(holds('Δημοτικό συμβούλιο 22/07/26', { kind: 'ordinary' })).toBe(true)
    })

    it('reads the kind and the urgency from the words of the name: urgency is no kind', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', council)).toMatchObject({ proposedKind: 'accountability', urgent: false })
        expect(analyzeStoredName('Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', council)).toMatchObject({ proposedKind: null, urgent: true })
        expect(holds('Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', { kind: 'accountability' })).toBe(true)
        expect(holds('Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: 'ordinary', urgent: true })).toBe(true)
        expect(holds('Έκτακτη Δημοτική Επιτροπή 26/11/25', { kind: 'ordinary', urgent: true }, { bodyName: 'Δημοτική Επιτροπή' })).toBe(true)
        // A record that is not urgent would lose the «Έκτακτη» of the name.
        expect(holds('Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: 'ordinary' })).toBe(false)
        expect(holds('Έκτακτη Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: null })).toBe(false)
    })

    it('reads the financial accounts from the words of the name', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Οικονομικών Καταστάσεων 22/07/26', council)).toMatchObject({ proposedKind: 'financialAccounts' })
        expect(holds('Ειδική Συνεδρίαση Οικονομικών Καταστάσεων 22/07/26', { kind: 'financialAccounts' })).toBe(true)
    })

    it('loses an ordinal that the record does not hold', () => {
        expect(analyzeStoredName('4η Ειδική Συνεδρίαση Λογοδοσίας', council)).toMatchObject({ ordinal: 4 })
        expect(holds('4η Ειδική Συνεδρίαση Λογοδοσίας', { kind: 'accountability', sessionNumber: 4 })).toBe(true)
        expect(holds('4η Ειδική Συνεδρίαση Λογοδοσίας', { kind: 'accountability' })).toBe(false)
    })

    it('proposes no kind for a bare «Ειδική Συνεδρίαση»: one name hides several kinds, and the invitation tells them apart', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', council))
            .toMatchObject({ proposedKind: null, note: 'special-unknown' })
        expect(holds('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: null })).toBe(false)
        expect(holds('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: 'ordinary' })).toBe(false)
        expect(holds('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: 'presidencyElection' })).toBe(true)
        expect(holds('Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', { kind: 'special' })).toBe(true)
    })

    it('reads a record of two meetings, without a kind or an urgency', () => {
        for (const name of [
            'Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26',
            'Ειδική Συνεδρίαση Λογοδοσίας & Τακτική Συνεδρίαση 18/03/26',
            'Ειδική Συνεδρίαση Λογοδοσίας και Έκτακτη Συνεδρίαση 29/08/25',
        ]) {
            expect(analyzeStoredName(name, council)).toMatchObject({ proposedKind: null, urgent: false, combined: true })
            expect(holds(name, { kind: null })).toBe(false)
        }
    })

    it('says that an interrupted meeting\'s bracket is held by no column', () => {
        expect(analyzeStoredName('Δημοτικό Συμβούλιο 20/04/26 [Διεκόπη]', council)).toMatchObject({
            proposedStatus: null, interrupted: true, unmappedBrackets: ['Διεκόπη'],
        })
        expect(holds('Δημοτικό Συμβούλιο 20/04/26 [Διεκόπη]', { kind: 'ordinary' })).toBe(false)
    })

    it('says that a name with more than body, kind and date loses words', () => {
        expect(holds('Ειδική Συνεδρίαση Λογοδοσίας για το 2024', { kind: 'accountability' })).toBe(false)
        expect(holds('Δημοτική - Διαχειριστική Επιτροπή 12/03/26', { kind: 'ordinary' }, { bodyName: 'Δημοτική Επιτροπή' })).toBe(false)
    })
})

describe('the two «απολογισμοί»', () => {
    it('reads no kind from a bare «Απολογισμού»: the activity report and the financial accounts both carry it', () => {
        expect(analyzeStoredName('Ειδική Συνεδρίαση Απολογισμού 23/12/25', council)).toMatchObject({ proposedKind: null, note: 'special-unknown' })
        expect(analyzeStoredName('Ειδική Συνεδρίαση Απολογισμού Πεπραγμένων 13/07/26', council)).toMatchObject({ proposedKind: 'activityReport' })
    })
})
