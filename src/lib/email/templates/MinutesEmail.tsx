import * as React from 'react';
import { Section, Text, Link } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { backOfficeLink, backOfficeText, ContactLine, documentEmailSubject } from '../components/BackOfficeEmail';
import { formatDate } from '@/lib/formatters/time';
import { DOCUMENT_NAMES } from '@/lib/documents/settings';
import type { RecordSection } from '@/lib/utils/subjects';

/**
 * A subject of the meeting that has no decision yet, as the incomplete email
 * lists it: its register (recordSection), its agenda index, and its title.
 */
export interface MissingSubject {
    section: RecordSection;
    agendaItemIndex: number | null;
    title: string;
}

interface MinutesEmailProps {
    administrativeBodyName: string;
    meetingDate: Date;
    /** The meeting's city timezone, for the dates. */
    timeZone: string;
    contactPhone: string;
}

interface MinutesIncompleteEmailProps extends MinutesEmailProps {
    /** The public page of the meeting: the clerk signs in there. */
    meetingUrl: string;
    /** The /decisions page of the meeting, where the subjects are linked to their decisions. */
    decisionsUrl: string;
    missingSubjects: MissingSubject[];
}

/**
 * The copy of the two minutes emails. Greek only: the minutes are a document of
 * the Greek Code, and the back office that receives them reads Greek. The
 * provisional copy is the team's text from the review of #887. A unit test
 * pins the sentences, so a change of wording is a deliberate one.
 */
export const minutesEmailCopy = {
    /** "Πρακτικά: {body}, {date}" */
    subject: (administrativeBodyName: string, meetingDate: Date, timeZone: string) =>
        documentEmailSubject(DOCUMENT_NAMES.minutes.el, administrativeBodyName, meetingDate, timeZone),
    /** The provisional minutes say so in the subject, before anyone opens the attachment. */
    subjectIncomplete: (administrativeBodyName: string, meetingDate: Date, timeZone: string) =>
        documentEmailSubject(`Πρόχειρα ${DOCUMENT_NAMES.minutes.el.toLocaleLowerCase('el')}`, administrativeBodyName, meetingDate, timeZone),
    /** The DOCX is attached: the sentence names it and links nowhere. */
    intro: (administrativeBodyName: string, meetingDate: Date, timeZone: string) =>
        `Επισυνάπτουμε παρακάτω τα πρακτικά της συνεδρίασης (${administrativeBodyName}) που πραγματοποιήθηκε στις ${formatDate(meetingDate, timeZone)}.`,
    introIncomplete: (administrativeBodyName: string, meetingDate: Date, timeZone: string) =>
        `Επισυνάπτουμε τα πρόχειρα πρακτικά της συνεδρίασης (${administrativeBodyName}) που πραγματοποιήθηκε στις ${formatDate(meetingDate, timeZone)}.`,
    incompleteReason: (count: number) =>
        count === 1
            ? 'Τα πρακτικά είναι πρόχειρα, επειδή δεν καταφέραμε να αντιστοιχίσουμε ένα θέμα με την απόφασή του στη Διαύγεια, πιθανώς επειδή δεν έχει αναρτηθεί ακόμα. Συγκεκριμένα, το θέμα για το οποίο δεν βρήκαμε απόφαση είναι:'
            : `Τα πρακτικά είναι πρόχειρα, επειδή δεν καταφέραμε να αντιστοιχίσουμε ${count} θέματα με την απόφασή τους στη Διαύγεια, πιθανώς επειδή δεν έχει αναρτηθεί ακόμα. Συγκεκριμένα, τα θέματα για τα οποία δεν βρήκαμε απόφαση είναι:`,
    outOfAgenda: 'Εκτός ημερήσιας διάταξης',
    stepsIntro: (count: number) =>
        count === 1
            ? 'Μπορείτε να συνδέσετε αυτό το θέμα με την απόφασή του μέσα από το OpenCouncil:'
            : 'Μπορείτε να συνδέσετε αυτά τα θέματα με αποφάσεις μέσα από το OpenCouncil:',
    /** Each step, split around the link it carries. */
    steps: {
        meetingPage: ['Πηγαίνετε στην σελίδα της συνεδρίασης', 'και βεβαιωθείτε πως είστε συνδεδεμένος (αναγράφεται πάνω δεξιά το όνομά σας).'],
        decisionsPage: ['Αριστερά, πατήστε «Αποφάσεις» ώστε να μεταβείτε στην σελίδα των αποφάσεων', '.'],
        missingList: 'Στο πάνω μέρος της σελίδας μπορείτε να δείτε τα θέματα που πρέπει να συνδεθούν με αποφάσεις.',
    },
    help: (contactPhone: string) => `Καλέστε μας στο ${contactPhone} αν χρειάζεστε βοήθεια!`,
} as const;

/** The complete minutes: every subject has its decision. Mirrors the transcript email. */
export const MinutesEmail = ({ administrativeBodyName, meetingDate, timeZone, contactPhone }: MinutesEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`${DOCUMENT_NAMES.minutes.el}: ${administrativeBodyName}`}>
        <Section>
            <Text style={backOfficeText}>{minutesEmailCopy.intro(administrativeBodyName, meetingDate, timeZone)}</Text>
            <ContactLine contactPhone={contactPhone} />
        </Section>
    </BaseTemplate>
);

/**
 * What a missing subject prints as: «3. Τίτλος» in the agenda, «Εκτός
 * ημερήσιας διάταξης: Τίτλος» out of it. The register comes from
 * recordSection, as in the DOCX and on the decisions page, never from the index.
 */
export function missingSubjectLabel(subject: MissingSubject): string {
    return subject.section === 'outOfAgenda' || subject.agendaItemIndex === null
        ? `${minutesEmailCopy.outOfAgenda}: ${subject.title}`
        : `${subject.agendaItemIndex}. ${subject.title}`;
}

/**
 * The provisional minutes: the threshold passed with subjects still without a
 * decision. It names those subjects and the steps that link them, with the
 * link of each page written out.
 */
export const MinutesIncompleteEmail = ({
    administrativeBodyName,
    meetingDate,
    timeZone,
    contactPhone,
    meetingUrl,
    decisionsUrl,
    missingSubjects,
}: MinutesIncompleteEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`Πρόχειρα ${DOCUMENT_NAMES.minutes.el.toLocaleLowerCase('el')}: ${administrativeBodyName}`}>
        <Section>
            <Text style={backOfficeText}>{minutesEmailCopy.introIncomplete(administrativeBodyName, meetingDate, timeZone)}</Text>
            <Text style={backOfficeText}>{minutesEmailCopy.incompleteReason(missingSubjects.length)}</Text>
            <ul style={{ ...backOfficeText, margin: '0 0 16px', paddingLeft: '20px' }}>
                {missingSubjects.map((subject, index) => (
                    <li key={`${subject.agendaItemIndex ?? 'x'}-${index}`}>{missingSubjectLabel(subject)}</li>
                ))}
            </ul>

            <Text style={{ ...backOfficeText, margin: '16px 0 4px' }}>{minutesEmailCopy.stepsIntro(missingSubjects.length)}</Text>
            <ol style={{ ...backOfficeText, margin: '0', paddingLeft: '20px' }}>
                <li style={{ marginBottom: '8px' }}>
                    {minutesEmailCopy.steps.meetingPage[0]}{' '}
                    <Link href={meetingUrl} style={backOfficeLink}>{meetingUrl}</Link>{' '}
                    {minutesEmailCopy.steps.meetingPage[1]}
                </li>
                <li style={{ marginBottom: '8px' }}>
                    {minutesEmailCopy.steps.decisionsPage[0]}{' '}
                    <Link href={decisionsUrl} style={backOfficeLink}>{decisionsUrl}</Link>
                    {minutesEmailCopy.steps.decisionsPage[1]}
                </li>
                <li style={{ marginBottom: '8px' }}>{minutesEmailCopy.steps.missingList}</li>
            </ol>

            <Text style={backOfficeText}>{minutesEmailCopy.help(contactPhone)}</Text>
        </Section>
    </BaseTemplate>
);
