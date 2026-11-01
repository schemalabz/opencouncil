import * as React from 'react';
import { Section, Text, Link } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { formatDate } from '@/lib/formatters/time';

/**
 * A subject of the meeting that has no decision yet, as the incomplete email
 * lists it: the agenda index and the title, or the title alone for a subject
 * discussed out of the agenda.
 */
export interface MissingSubject {
    agendaItemIndex: number | null;
    title: string;
}

interface MinutesEmailProps {
    administrativeBodyName: string;
    meetingDate: Date;
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
    subject: (administrativeBodyName: string, meetingDate: Date) =>
        `Πρακτικά: ${administrativeBodyName}, ${formatDate(meetingDate)}`,
    /** The provisional minutes say so in the subject, before anyone opens the attachment. */
    subjectIncomplete: (administrativeBodyName: string, meetingDate: Date) =>
        `Πρόχειρα πρακτικά: ${administrativeBodyName}, ${formatDate(meetingDate)}`,
    /** The DOCX is attached: the sentence names it and links nowhere. */
    intro: (administrativeBodyName: string, meetingDate: Date) =>
        `Επισυνάπτουμε παρακάτω τα πρακτικά της συνεδρίασης (${administrativeBodyName}) που πραγματοποιήθηκε στις ${formatDate(meetingDate)}.`,
    introIncomplete: (administrativeBodyName: string, meetingDate: Date) =>
        `Επισυνάπτουμε τα πρόχειρα πρακτικά της συνεδρίασης (${administrativeBodyName}) που πραγματοποιήθηκε στις ${formatDate(meetingDate)}.`,
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
    help: 'Καλέστε μας στο 2111980212 αν χρειάζεστε βοήθεια!',
    contact: 'Για ό,τι χρειαστείτε, είμαστε στην διάθεσή σας στο 2111980212.',
} as const;

const bodyText = {
    color: '#374151',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '24px 0',
} as const;

const contactText = {
    color: '#6b7280',
    fontSize: '13px',
    lineHeight: '20px',
    marginTop: '32px',
    marginBottom: '0',
} as const;

const linkStyle = { color: '#2563eb', textDecoration: 'underline' } as const;

/** The complete minutes: every subject has its decision. Mirrors the transcript email. */
export const MinutesEmail = ({ administrativeBodyName, meetingDate }: MinutesEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`Πρακτικά: ${administrativeBodyName}`}>
        <Section>
            <Text style={bodyText}>{minutesEmailCopy.intro(administrativeBodyName, meetingDate)}</Text>
            <Text style={contactText}>{minutesEmailCopy.contact}</Text>
        </Section>
    </BaseTemplate>
);

/** What a missing subject prints as: «3. Τίτλος», or «Εκτός ημερήσιας διάταξης: Τίτλος». */
export function missingSubjectLabel(subject: MissingSubject): string {
    return subject.agendaItemIndex === null
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
    meetingUrl,
    decisionsUrl,
    missingSubjects,
}: MinutesIncompleteEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`Πρόχειρα πρακτικά: ${administrativeBodyName}`}>
        <Section>
            <Text style={bodyText}>{minutesEmailCopy.introIncomplete(administrativeBodyName, meetingDate)}</Text>
            <Text style={bodyText}>{minutesEmailCopy.incompleteReason(missingSubjects.length)}</Text>
            <ul style={{ ...bodyText, margin: '0 0 16px', paddingLeft: '20px' }}>
                {missingSubjects.map((subject, index) => (
                    <li key={`${subject.agendaItemIndex ?? 'x'}-${index}`}>{missingSubjectLabel(subject)}</li>
                ))}
            </ul>

            <Text style={{ ...bodyText, margin: '16px 0 4px' }}>{minutesEmailCopy.stepsIntro(missingSubjects.length)}</Text>
            <ol style={{ ...bodyText, margin: '0', paddingLeft: '20px' }}>
                <li style={{ marginBottom: '8px' }}>
                    {minutesEmailCopy.steps.meetingPage[0]}{' '}
                    <Link href={meetingUrl} style={linkStyle}>{meetingUrl}</Link>{' '}
                    {minutesEmailCopy.steps.meetingPage[1]}
                </li>
                <li style={{ marginBottom: '8px' }}>
                    {minutesEmailCopy.steps.decisionsPage[0]}{' '}
                    <Link href={decisionsUrl} style={linkStyle}>{decisionsUrl}</Link>
                    {minutesEmailCopy.steps.decisionsPage[1]}
                </li>
                <li style={{ marginBottom: '8px' }}>{minutesEmailCopy.steps.missingList}</li>
            </ol>

            <Text style={bodyText}>{minutesEmailCopy.help}</Text>
        </Section>
    </BaseTemplate>
);
