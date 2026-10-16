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
    /** The /decisions page of the meeting, where the minutes are completed and exported. */
    decisionsUrl: string;
}

interface MinutesIncompleteEmailProps extends MinutesEmailProps {
    missingSubjects: MissingSubject[];
}

/**
 * The copy of the two minutes emails. Greek only: the minutes are a document of
 * the Greek Code, and the back office that receives them reads Greek. A unit
 * test pins the sentences, so a change of wording is a deliberate one.
 */
export const minutesEmailCopy = {
    /** "Πρακτικά: {body}, {date}" */
    subject: (administrativeBodyName: string, meetingDate: Date) =>
        `Πρακτικά: ${administrativeBodyName}, ${formatDate(meetingDate)}`,
    /** The provisional minutes say so in the subject, before anyone opens the attachment. */
    subjectIncomplete: (administrativeBodyName: string, meetingDate: Date) =>
        `Προσωρινά πρακτικά: ${administrativeBodyName}, ${formatDate(meetingDate)}`,
    intro: (administrativeBodyName: string, meetingDate: Date) =>
        `της συνεδρίασης (${administrativeBodyName}) που πραγματοποιήθηκε στις ${formatDate(meetingDate)}.`,
    incompleteNotice: (count: number) =>
        count === 1
            ? 'Τα πρακτικά είναι προσωρινά: ένα θέμα δεν έχει ακόμη απόφαση, και τυπώνεται χωρίς αριθμό απόφασης.'
            : `Τα πρακτικά είναι προσωρινά: ${count} θέματα δεν έχουν ακόμη απόφαση, και τυπώνονται χωρίς αριθμό απόφασης.`,
    missingHeading: 'Θέματα χωρίς απόφαση',
    outOfAgenda: 'Εκτός ημερήσιας διάταξης',
    stepsHeading: 'Πώς συμπληρώνονται τα πρακτικά',
    steps: [
        'Βρείτε την απόφαση. Στη σελίδα των αποφάσεων της συνεδρίασης, το φίλτρο «Χωρίς απόφαση» δείχνει τα θέματα που λείπουν. Για κάθε θέμα, αναζητήστε την απόφαση στη Διαύγεια ή καταχωρίστε την με το χέρι.',
        'Συνδέστε την απόφαση με το θέμα της.',
        'Εξάγετε τα τελικά πρακτικά από την ίδια σελίδα («Εξαγωγή σε DOCX»).',
    ],
    decisionsLink: 'σελίδα των αποφάσεων',
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
export const MinutesEmail = ({ administrativeBodyName, meetingDate, decisionsUrl }: MinutesEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`Πρακτικά: ${administrativeBodyName}`}>
        <Section>
            <Text style={bodyText}>
                Επισυνάπτουμε παρακάτω τα{' '}
                <Link href={decisionsUrl} style={linkStyle}>πρακτικά</Link>{' '}
                {minutesEmailCopy.intro(administrativeBodyName, meetingDate)}
            </Text>
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
 * decision. Three meetings in four get this email, so it carries the work the
 * back office has to do, not an apology.
 */
export const MinutesIncompleteEmail = ({
    administrativeBodyName,
    meetingDate,
    decisionsUrl,
    missingSubjects,
}: MinutesIncompleteEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`Προσωρινά πρακτικά: ${administrativeBodyName}`}>
        <Section>
            <Text style={bodyText}>
                Επισυνάπτουμε παρακάτω τα προσωρινά{' '}
                <Link href={decisionsUrl} style={linkStyle}>πρακτικά</Link>{' '}
                {minutesEmailCopy.intro(administrativeBodyName, meetingDate)}
            </Text>
            <Text style={{ ...bodyText, fontWeight: '600' }}>
                {minutesEmailCopy.incompleteNotice(missingSubjects.length)}
            </Text>

            <Text style={{ ...bodyText, margin: '16px 0 4px', fontWeight: '600' }}>{minutesEmailCopy.missingHeading}</Text>
            <ul style={{ ...bodyText, margin: '0 0 16px', paddingLeft: '20px' }}>
                {missingSubjects.map((subject, index) => (
                    <li key={`${subject.agendaItemIndex ?? 'x'}-${index}`}>{missingSubjectLabel(subject)}</li>
                ))}
            </ul>

            <Text style={{ ...bodyText, margin: '16px 0 4px', fontWeight: '600' }}>{minutesEmailCopy.stepsHeading}</Text>
            <ol style={{ ...bodyText, margin: '0', paddingLeft: '20px' }}>
                {minutesEmailCopy.steps.map((step) => (
                    <li key={step} style={{ marginBottom: '8px' }}>{step}</li>
                ))}
            </ol>
            <Text style={bodyText}>
                Η <Link href={decisionsUrl} style={linkStyle}>{minutesEmailCopy.decisionsLink}</Link> της συνεδρίασης ανοίγει με τον λογαριασμό σας στο OpenCouncil.
            </Text>

            <Text style={contactText}>{minutesEmailCopy.contact}</Text>
        </Section>
    </BaseTemplate>
);
