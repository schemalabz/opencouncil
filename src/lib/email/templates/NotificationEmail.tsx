import * as React from 'react';
import { Section, Heading, Text, Button, Container } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';

interface NotificationSubject {
    id: string;
    name: string;
    description: string;
    topic?: {
        name: string;
        colorHex: string;
    } | null;
}

interface NotificationEmailProps {
    type: 'beforeMeeting' | 'afterMeeting';
    meetingDate: Date;
    administrativeBodyName: string;
    cityName: string;
    subjects: NotificationSubject[];
    notificationUrl: string;
}

export const NotificationEmail = ({
    type,
    meetingDate,
    administrativeBodyName,
    cityName,
    subjects,
    notificationUrl
}: NotificationEmailProps): React.ReactElement => {
    const typeLabel = type === 'beforeMeeting'
        ? 'Ειδοποίηση επερχόμενης συνεδρίασης'
        : 'Ειδοποίηση πρόσφατης συνεδρίασης';

    const meetingDateFormatted = meetingDate.toLocaleDateString('el-GR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <BaseTemplate previewText={typeLabel}>
            <Section style={{ textAlign: 'center' }}>
                <Heading
                    style={{
                        color: '#1f2937',
                        fontSize: '24px',
                        fontWeight: '600',
                        margin: '30px 0',
                    }}
                >
                    {typeLabel}
                </Heading>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                    }}
                >
                    {administrativeBodyName} - {meetingDateFormatted}
                </Text>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '24px 0',
                    }}
                >
                    {cityName}
                </Text>

                <Heading
                    style={{
                        color: '#1f2937',
                        fontSize: '18px',
                        fontWeight: '600',
                        margin: '32px 0 16px 0',
                        textAlign: 'left',
                    }}
                >
                    Θέματα που σας αφορούν:
                </Heading>

                {subjects.map((subject) => (
                    <Container
                        key={subject.id}
                        style={{
                            backgroundColor: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                            margin: '16px 0',
                        }}
                    >
                        <Heading
                            style={{
                                color: '#111827',
                                fontSize: '16px',
                                fontWeight: '600',
                                margin: '0 0 8px 0',
                            }}
                        >
                            {subject.name}
                        </Heading>

                        <Text
                            style={{
                                color: '#6b7280',
                                fontSize: '14px',
                                margin: '0 0 8px 0',
                                lineHeight: '20px',
                            }}
                        >
                            {subject.description}
                        </Text>

                        {subject.topic && (
                            <Container
                                style={{
                                    display: 'inline-block',
                                    backgroundColor: subject.topic.colorHex,
                                    color: '#ffffff',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    marginTop: '8px',
                                }}
                            >
                                {subject.topic.name}
                            </Container>
                        )}
                    </Container>
                ))}

                <Button
                    href={notificationUrl}
                    style={{
                        backgroundColor: '#000000',
                        borderRadius: '6px',
                        color: '#ffffff',
                        display: 'inline-block',
                        fontSize: '16px',
                        fontWeight: '600',
                        padding: '12px 24px',
                        textDecoration: 'none',
                        margin: '24px 0',
                    }}
                >
                    Δείτε την πλήρη ενημέρωση
                </Button>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '12px',
                        margin: '24px 0',
                    }}
                >
                    Δεν θέλετε να λαμβάνετε ειδοποιήσεις;{' '}
                    <a
                        href={`${process.env.NEXTAUTH_URL || 'https://opencouncil.gr'}/el/profile`}
                        style={{ color: '#2563eb', textDecoration: 'underline' }}
                    >
                        Διαχειριστείτε τις προτιμήσεις σας
                    </a>
                </Text>
            </Section>
        </BaseTemplate>
    );
};

