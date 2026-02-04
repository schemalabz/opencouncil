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
                    Επισυνάπτουμε παρακάτω την{' '}
                    <Link
                        href={transcriptUrl}
                        style={{ color: '#2563eb', textDecoration: 'underline' }}
                    >
                        απομαγνητοφώνηση
                    </Link>{' '}
                    της συνεδρίασης ({administrativeBodyName}) που πραγματοποιήθηκε στις {meetingDateFormatted}.
                </Text>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '13px',
                        lineHeight: '20px',
                        marginTop: '32px',
                        marginBottom: '0',
                    }}
                >
                    Για ό,τι χρειαστείτε, είμαστε στην διάθεσή σας στο 2111980212.
                </Text>
            </Section>
        </BaseTemplate>
    );
};
