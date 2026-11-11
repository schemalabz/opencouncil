import { renderToStaticMarkup } from 'react-dom/server';
import { MinutesEmail, MinutesIncompleteEmail, minutesEmailCopy, missingSubjectLabel } from '../MinutesEmail';
import { TranscriptEmail } from '../TranscriptEmail';

const meetingDate = new Date('2026-03-10T17:00:00Z');
// 23:30 UTC on 10 Mar: 11 Mar in Athens, still 10 Mar in Montréal
const lateMeeting = new Date('2026-03-10T23:30:00Z');
const timeZone = 'Europe/Athens';
const contactPhone = '+30 210 0000000';
const meetingUrl = 'https://opencouncil.gr/athens/mar10_2026';
const decisionsUrl = `${meetingUrl}/decisions`;

describe('the minutes emails', () => {
    it('marks the provisional minutes in the subject, before anyone opens the attachment', () => {
        expect(minutesEmailCopy.subject('Δημοτικό Συμβούλιο', meetingDate, timeZone)).toBe('Πρακτικά: Δημοτικό Συμβούλιο, 10 Μαρτίου 2026');
        expect(minutesEmailCopy.subjectIncomplete('Δημοτικό Συμβούλιο', meetingDate, timeZone)).toBe('Πρόχειρα πρακτικά: Δημοτικό Συμβούλιο, 10 Μαρτίου 2026');
    });

    it('dates the subject and the intro in the timezone of the meeting\'s city', () => {
        expect(minutesEmailCopy.subject('Conseil', lateMeeting, 'Europe/Athens')).toContain('11 Μαρτίου 2026');
        expect(minutesEmailCopy.subject('Conseil', lateMeeting, 'America/Toronto')).toContain('10 Μαρτίου 2026');
        expect(minutesEmailCopy.introIncomplete('Conseil', lateMeeting, 'America/Toronto')).toContain('10 Μαρτίου 2026');
    });

    it('labels a missing subject by its agenda index, or as out of the agenda', () => {
        expect(missingSubjectLabel({ section: 'agenda', agendaItemIndex: 3, title: 'Έγκριση προϋπολογισμού' })).toBe('3. Έγκριση προϋπολογισμού');
        expect(missingSubjectLabel({ section: 'outOfAgenda', agendaItemIndex: null, title: 'Ψήφισμα' })).toBe('Εκτός ημερήσιας διάταξης: Ψήφισμα');
    });

    it('labels an out-of-agenda subject as such even when the agenda PDF gave it an index', () => {
        expect(missingSubjectLabel({ section: 'outOfAgenda', agendaItemIndex: 7, title: 'Ψήφισμα' })).toBe('Εκτός ημερήσιας διάταξης: Ψήφισμα');
    });

    // The DOCX is attached: a link on «πρακτικά» would lead somewhere else
    it('attaches the complete minutes, links nowhere, and gives the phone of the realm', () => {
        const html = renderToStaticMarkup(MinutesEmail({ administrativeBodyName: 'Δημοτικό Συμβούλιο', meetingDate: lateMeeting, timeZone: 'America/Toronto', contactPhone }));

        expect(html).toContain('Επισυνάπτουμε παρακάτω τα πρακτικά της συνεδρίασης (Δημοτικό Συμβούλιο) που πραγματοποιήθηκε στις 10 Μαρτίου 2026.');
        expect(html).toContain(`είμαστε στην διάθεσή σας στο ${contactPhone}`);
        expect(html).not.toContain('2111980212');
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('πρόχειρα');
    });

    it('says why the minutes are provisional, lists the subjects, and gives the three steps with both links', () => {
        const html = renderToStaticMarkup(MinutesIncompleteEmail({
            administrativeBodyName: 'Δημοτική Επιτροπή',
            meetingDate,
            timeZone,
            contactPhone,
            meetingUrl,
            decisionsUrl,
            missingSubjects: [
                { section: 'agenda', agendaItemIndex: 2, title: 'Έγκριση δαπάνης' },
                { section: 'outOfAgenda', agendaItemIndex: 5, title: 'Ψήφισμα για το νερό' },
            ],
        }));

        // The first sentence names the attachment without a link
        expect(html).toMatch(/<p[^>]*>Επισυνάπτουμε τα πρόχειρα πρακτικά της συνεδρίασης \(Δημοτική Επιτροπή\) που πραγματοποιήθηκε στις 10 Μαρτίου 2026\.<\/p>/);
        expect(html).toContain('δεν καταφέραμε να αντιστοιχίσουμε 2 θέματα με την απόφασή τους στη Διαύγεια');
        expect(html).toContain('2. Έγκριση δαπάνης');
        expect(html).toContain('Εκτός ημερήσιας διάταξης: Ψήφισμα για το νερό');
        expect(html).not.toContain('5. Ψήφισμα');
        expect(html).toContain(minutesEmailCopy.steps.meetingPage[0]);
        expect(html).toContain(`href="${meetingUrl}"`);
        expect(html).toContain(minutesEmailCopy.steps.decisionsPage[0]);
        expect(html).toContain(`href="${decisionsUrl}"`);
        expect(html).toContain(minutesEmailCopy.steps.missingList);
        // Three steps, numbered 1 to 3
        expect(html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1].match(/<li/g)).toHaveLength(3);
        expect(html).toContain(`Καλέστε μας στο ${contactPhone} αν χρειάζεστε βοήθεια!`);
    });

    it('speaks of one subject in the singular', () => {
        expect(minutesEmailCopy.incompleteReason(1)).toContain('να αντιστοιχίσουμε ένα θέμα με την απόφασή του');
        expect(minutesEmailCopy.stepsIntro(1)).toContain('αυτό το θέμα');
    });
});

describe('the transcript email', () => {
    it('links the transcript, dates the meeting in its city\'s timezone, and gives the phone of the realm', () => {
        const transcriptUrl = `${meetingUrl}/transcript`;
        const html = renderToStaticMarkup(TranscriptEmail({ administrativeBodyName: 'Conseil municipal', meetingDate: lateMeeting, timeZone: 'America/Toronto', contactPhone, transcriptUrl }));
        expect(html).toContain(`href="${transcriptUrl}"`);
        expect(html).toContain('(Conseil municipal) που πραγματοποιήθηκε στις 10 Μαρτίου 2026.');
        expect(html).toContain(`είμαστε στην διάθεσή σας στο ${contactPhone}`);
    });
});
