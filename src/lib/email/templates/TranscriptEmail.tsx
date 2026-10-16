import * as React from 'react';
import { Section, Text, Link } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { backOfficeLink, backOfficeText, ContactLine } from '../components/BackOfficeEmail';
import { formatDate } from '@/lib/formatters/time';
import { DOCUMENT_NAMES } from '@/lib/documents/settings';

interface TranscriptEmailProps {
    administrativeBodyName: string;
    meetingDate: Date;
    /** The meeting's city timezone, for the date. */
    timeZone: string;
    contactPhone: string;
    transcriptUrl: string;
}

export const TranscriptEmail = ({
    administrativeBodyName,
    meetingDate,
    timeZone,
    contactPhone,
    transcriptUrl,
}: TranscriptEmailProps): React.ReactElement => (
    <BaseTemplate previewText={`${DOCUMENT_NAMES.transcript.el}: ${administrativeBodyName}`}>
        <Section>
            <Text style={backOfficeText}>
                Επισυνάπτουμε παρακάτω την{' '}
                <Link href={transcriptUrl} style={backOfficeLink}>απομαγνητοφώνηση</Link>{' '}
                της συνεδρίασης ({administrativeBodyName}) που πραγματοποιήθηκε στις {formatDate(meetingDate, timeZone)}.
            </Text>
            <ContactLine contactPhone={contactPhone} />
        </Section>
    </BaseTemplate>
);
