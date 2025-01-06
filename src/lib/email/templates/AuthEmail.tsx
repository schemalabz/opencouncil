import * as React from 'react';
import { Section, Heading, Text, Button } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';

interface AuthEmailProps {
    url: string;
}

export const AuthEmail = ({ url }: AuthEmailProps): React.ReactElement => (
    <BaseTemplate previewText="Συνδεθείτε στο OpenCouncil">
        <Section style={{ textAlign: 'center' }}>
            <Heading
                style={{
                    color: '#1f2937',
                    fontSize: '24px',
                    fontWeight: '600',
                    margin: '30px 0',
                }}
            >
                Καλώς ήρθατε στο OpenCouncil
            </Heading>

            <Text
                style={{
                    color: '#4b5563',
                    fontSize: '16px',
                    margin: '16px 0',
                }}
            >
                Πατήστε το παρακάτω κουμπί για να συνδεθείτε στο λογαριασμό σας.
            </Text>

            <Button
                href={url}
                style={{
                    backgroundColor: '#2563eb',
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
                Σύνδεση
            </Button>

            <Text
                style={{
                    color: '#6b7280',
                    fontSize: '14px',
                    margin: '24px 0',
                }}
            >
                Αν δεν ζητήσατε εσείς αυτό το email, μπορείτε να το αγνοήσετε με ασφάλεια.
            </Text>
        </Section>
    </BaseTemplate>
); 