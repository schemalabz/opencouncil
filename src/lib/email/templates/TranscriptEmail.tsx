import * as React from 'react';
import { Section, Text, Link } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { formatDate } from '@/lib/formatters/time';

interface TranscriptEmailProps {
    administrativeBodyName: string;
    meetingDate: Date;
    transcriptUrl: string;
}

export const TranscriptEmail = ({
    administrativeBodyName,
    meetingDate,
    transcriptUrl,
}: TranscriptEmailProps): React.ReactElement => {
    const previewText = `Απομαγνητοφώνηση: ${administrativeBodyName}`;

    const meetingDateFormatted = formatDate(meetingDate);

    return (
        <BaseTemplate previewText={previewText}>
            <Section>
                <Text
                    style={{
                        color: '#374151',
                        fontSize: '16px',
                        lineHeight: '24px',
                        margin: '24px 0',
                    }}
                >
                    Σας αποστέλλουμε{' '}
                    <Link
                        href={transcriptUrl}
                        style={{ color: '#2563eb', textDecoration: 'underline' }}
                    >
                        την απομαγνητοφώνηση
                    </Link>{' '}
                    της συνεδρίασης ({administrativeBodyName}) που πραγματοποιήθηκε στις {meetingDateFormatted}.
                </Text>

                <Text
                    style={{
                        color: '#9ca3af',
                        fontSize: '12px',
                        margin: '24px 0 0 0',
                        fontStyle: 'italic',
                    }}
                >
                    Αυτό το email αποστέλλεται αυτόματα από το OpenCouncil.
                </Text>
            </Section>
        </BaseTemplate>
    );
};
