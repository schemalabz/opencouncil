import * as React from 'react';
import { Section, Heading, Text, Button, Hr } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';

interface HighlightCompleteEmailProps {
    userName: string;
    highlightTitle: string;
    meetingName: string;
    cityName: string;
    duration: string;
    highlightUrl: string;
    status: 'success' | 'failure';
}

export const HighlightCompleteEmail = ({
    userName,
    highlightTitle,
    meetingName,
    cityName,
    duration,
    highlightUrl,
    status
}: HighlightCompleteEmailProps): React.ReactElement => {
    const isSuccess = status === 'success';
    
    return (
        <BaseTemplate previewText={isSuccess ? "Το Στιγμιότυπο σας είναι έτοιμο!" : "Πρόβλημα με τη δημιουργία Στιγμιότυπου"}>
            <Section style={{ textAlign: 'center' }}>
                <Heading
                    style={{
                        color: isSuccess ? '#059669' : '#dc2626',
                        fontSize: '24px',
                        fontWeight: '600',
                        margin: '30px 0 20px',
                    }}
                >
                    {isSuccess ? '✓ Το Στιγμιότυπο σας είναι έτοιμο!' : '✕ Πρόβλημα με τη δημιουργία'}
                </Heading>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                    }}
                >
                    Γεια σας {userName},
                </Text>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                        lineHeight: '24px',
                    }}
                >
                    {isSuccess 
                        ? 'Το βίντεο στιγμιότυπο σας δημιουργήθηκε επιτυχώς και είναι έτοιμο για προβολή!'
                        : 'Δυστυχώς, αντιμετωπίσαμε ένα πρόβλημα κατά τη δημιουργία του βίντεο στιγμιότυπου σας.'}
                </Text>
            </Section>

            <Section
                style={{
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    padding: '24px',
                    margin: '24px 0',
                }}
            >
                <Heading
                    style={{
                        color: '#1f2937',
                        fontSize: '18px',
                        fontWeight: '600',
                        margin: '0 0 16px',
                    }}
                >
                    Λεπτομέρειες Στιγμιότυπου
                </Heading>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '8px 0',
                        lineHeight: '20px',
                    }}
                >
                    <strong style={{ color: '#374151' }}>Τίτλος:</strong> {highlightTitle}
                </Text>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '8px 0',
                        lineHeight: '20px',
                    }}
                >
                    <strong style={{ color: '#374151' }}>Συνεδρίαση:</strong> {meetingName}
                </Text>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '8px 0',
                        lineHeight: '20px',
                    }}
                >
                    <strong style={{ color: '#374151' }}>Δήμος:</strong> {cityName}
                </Text>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '8px 0',
                        lineHeight: '20px',
                    }}
                >
                    <strong style={{ color: '#374151' }}>Διάρκεια:</strong> {duration}
                </Text>
            </Section>

            {isSuccess ? (
                <Section style={{ textAlign: 'center' }}>
                    <Button
                        href={highlightUrl}
                        style={{
                            backgroundColor: '#2563eb',
                            borderRadius: '6px',
                            color: '#ffffff',
                            display: 'inline-block',
                            fontSize: '16px',
                            fontWeight: '600',
                            padding: '12px 32px',
                            textDecoration: 'none',
                            margin: '24px 0',
                        }}
                    >
                        Δείτε το Στιγμιότυπο
                    </Button>

                    <Text
                        style={{
                            color: '#6b7280',
                            fontSize: '14px',
                            margin: '24px 0',
                            lineHeight: '20px',
                        }}
                    >
                        Μπορείτε να κατεβάσετε το βίντεο ή να το μοιραστείτε με άλλους από τη σελίδα του στιγμιότυπου.
                    </Text>
                </Section>
            ) : (
                <Section style={{ textAlign: 'center' }}>
                    <Button
                        href={highlightUrl}
                        style={{
                            backgroundColor: '#dc2626',
                            borderRadius: '6px',
                            color: '#ffffff',
                            display: 'inline-block',
                            fontSize: '16px',
                            fontWeight: '600',
                            padding: '12px 32px',
                            textDecoration: 'none',
                            margin: '24px 0',
                        }}
                    >
                        Δοκιμάστε Ξανά
                    </Button>

                    <Text
                        style={{
                            color: '#6b7280',
                            fontSize: '14px',
                            margin: '24px 0',
                            lineHeight: '20px',
                        }}
                    >
                        Παρακαλούμε δοκιμάστε ξανά να δημιουργήσετε το στιγμιότυπο. Αν το πρόβλημα συνεχιστεί, επικοινωνήστε μαζί μας στο hello@opencouncil.gr
                    </Text>
                </Section>
            )}

            <Hr style={{
                borderTop: '1px solid #e5e7eb',
                margin: '32px 0 24px',
            }} />

            <Section style={{ textAlign: 'center' }}>
                <Text
                    style={{
                        color: '#9ca3af',
                        fontSize: '12px',
                        margin: '0',
                        lineHeight: '18px',
                    }}
                >
                    Ευχαριστούμε που χρησιμοποιείτε το OpenCouncil!
                </Text>
            </Section>
        </BaseTemplate>
    );
};

