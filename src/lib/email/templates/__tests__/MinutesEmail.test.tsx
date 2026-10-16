import { renderToStaticMarkup } from 'react-dom/server';
import { MinutesEmail, MinutesIncompleteEmail, minutesEmailCopy, missingSubjectLabel } from '../MinutesEmail';

const meetingDate = new Date('2026-03-10T17:00:00Z');
const decisionsUrl = 'https://opencouncil.gr/athens/mar10_2026/decisions';

describe('the minutes emails', () => {
    it('marks the provisional minutes in the subject, before anyone opens the attachment', () => {
        expect(minutesEmailCopy.subject('Δημοτικό Συμβούλιο', meetingDate)).toMatch(/^Πρακτικά: Δημοτικό Συμβούλιο, /);
        expect(minutesEmailCopy.subjectIncomplete('Δημοτικό Συμβούλιο', meetingDate)).toMatch(/^Προσωρινά πρακτικά: Δημοτικό Συμβούλιο, /);
    });

    it('labels a missing subject by its agenda index, or as out of the agenda', () => {
        expect(missingSubjectLabel({ agendaItemIndex: 3, title: 'Έγκριση προϋπολογισμού' })).toBe('3. Έγκριση προϋπολογισμού');
        expect(missingSubjectLabel({ agendaItemIndex: null, title: 'Ψήφισμα' })).toBe('Εκτός ημερήσιας διάταξης: Ψήφισμα');
    });

    it('links the complete minutes to the decisions page', async () => {
        const html = renderToStaticMarkup(MinutesEmail({ administrativeBodyName: 'Δημοτικό Συμβούλιο', meetingDate, decisionsUrl }));

        expect(html).toContain(decisionsUrl);
        expect(html).toContain('Επισυνάπτουμε παρακάτω τα');
        expect(html).not.toContain('προσωρινά');
    });

    it('lists the subjects without a decision and the three steps that complete them', async () => {
        const html = renderToStaticMarkup(MinutesIncompleteEmail({
            administrativeBodyName: 'Δημοτική Επιτροπή',
            meetingDate,
            decisionsUrl,
            missingSubjects: [
                { agendaItemIndex: 2, title: 'Έγκριση δαπάνης' },
                { agendaItemIndex: null, title: 'Ψήφισμα για το νερό' },
            ],
        }));

        expect(html).toContain('2 θέματα δεν έχουν ακόμη απόφαση');
        expect(html).toContain('2. Έγκριση δαπάνης');
        expect(html).toContain('Εκτός ημερήσιας διάταξης: Ψήφισμα για το νερό');
        for (const step of minutesEmailCopy.steps) {
            expect(html).toContain(step.slice(0, 30));
        }
        expect(html).toContain(decisionsUrl);
    });

    it('speaks of one subject in the singular', () => {
        expect(minutesEmailCopy.incompleteNotice(1)).toContain('ένα θέμα δεν έχει');
    });
});
