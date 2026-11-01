import { renderToStaticMarkup } from 'react-dom/server';
import { MinutesEmail, MinutesIncompleteEmail, minutesEmailCopy, missingSubjectLabel } from '../MinutesEmail';

const meetingDate = new Date('2026-03-10T17:00:00Z');
const meetingUrl = 'https://opencouncil.gr/athens/mar10_2026';
const decisionsUrl = `${meetingUrl}/decisions`;

describe('the minutes emails', () => {
    it('marks the provisional minutes in the subject, before anyone opens the attachment', () => {
        expect(minutesEmailCopy.subject('Δημοτικό Συμβούλιο', meetingDate)).toMatch(/^Πρακτικά: Δημοτικό Συμβούλιο, /);
        expect(minutesEmailCopy.subjectIncomplete('Δημοτικό Συμβούλιο', meetingDate)).toMatch(/^Πρόχειρα πρακτικά: Δημοτικό Συμβούλιο, /);
    });

    it('labels a missing subject by its agenda index, or as out of the agenda', () => {
        expect(missingSubjectLabel({ agendaItemIndex: 3, title: 'Έγκριση προϋπολογισμού' })).toBe('3. Έγκριση προϋπολογισμού');
        expect(missingSubjectLabel({ agendaItemIndex: null, title: 'Ψήφισμα' })).toBe('Εκτός ημερήσιας διάταξης: Ψήφισμα');
    });

    // The DOCX is attached: a link on «πρακτικά» would lead somewhere else
    it('attaches the complete minutes and links nowhere', () => {
        const html = renderToStaticMarkup(MinutesEmail({ administrativeBodyName: 'Δημοτικό Συμβούλιο', meetingDate }));

        expect(html).toContain('Επισυνάπτουμε παρακάτω τα πρακτικά της συνεδρίασης (Δημοτικό Συμβούλιο)');
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('πρόχειρα');
    });

    it('says why the minutes are provisional, lists the subjects, and gives the three steps with both links', () => {
        const html = renderToStaticMarkup(MinutesIncompleteEmail({
            administrativeBodyName: 'Δημοτική Επιτροπή',
            meetingDate,
            meetingUrl,
            decisionsUrl,
            missingSubjects: [
                { agendaItemIndex: 2, title: 'Έγκριση δαπάνης' },
                { agendaItemIndex: null, title: 'Ψήφισμα για το νερό' },
            ],
        }));

        // The first sentence names the attachment without a link
        expect(html).toMatch(/<p[^>]*>Επισυνάπτουμε τα πρόχειρα πρακτικά της συνεδρίασης \(Δημοτική Επιτροπή\)[^<]*<\/p>/);
        expect(html).toContain('δεν καταφέραμε να αντιστοιχίσουμε 2 θέματα με την απόφασή τους στη Διαύγεια');
        expect(html).toContain('2. Έγκριση δαπάνης');
        expect(html).toContain('Εκτός ημερήσιας διάταξης: Ψήφισμα για το νερό');
        expect(html).toContain(minutesEmailCopy.steps.meetingPage[0]);
        expect(html).toContain(`href="${meetingUrl}"`);
        expect(html).toContain(minutesEmailCopy.steps.decisionsPage[0]);
        expect(html).toContain(`href="${decisionsUrl}"`);
        expect(html).toContain(minutesEmailCopy.steps.missingList);
        // Three steps, numbered 1 to 3
        expect(html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1].match(/<li/g)).toHaveLength(3);
        expect(html).toContain('Καλέστε μας στο 2111980212 αν χρειάζεστε βοήθεια!');
    });

    it('speaks of one subject in the singular', () => {
        expect(minutesEmailCopy.incompleteReason(1)).toContain('να αντιστοιχίσουμε ένα θέμα με την απόφασή του');
        expect(minutesEmailCopy.stepsIntro(1)).toContain('αυτό το θέμα');
    });
});
