import * as React from 'react';
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Img,
    Text,
    Hr,
} from '@react-email/components';

interface BaseTemplateProps {
    children: React.ReactNode;
    previewText?: string;
}

export const BaseTemplate = ({
    children,
    previewText = 'OpenCouncil - Ψηφιακή Δημοκρατία'
}: BaseTemplateProps): React.ReactElement => (
    <Html>
        <Head>
            <title>OpenCouncil</title>
            <Preview>{previewText}</Preview>
        </Head>
        <Body style={{
            backgroundColor: '#f6f9fc',
            margin: '0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}>
            <Container style={{
                backgroundColor: '#ffffff',
                margin: '0 auto',
                padding: '20px',
                maxWidth: '600px',
                borderRadius: '8px',
                marginTop: '20px',
            }}>
                <Section style={{ textAlign: 'center' }}>
                    <Img
                        src="https://opencouncil.gr/logo.png"
                        alt="OpenCouncil"
                        width="150"
                        height="auto"
                        style={{
                            margin: '0 auto 20px',
                        }}
                    />
                </Section>

                {children}

                <Hr style={{
                    borderTop: '1px solid #e6ebf1',
                    margin: '20px 0'
                }} />

                <Section style={{
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '12px',
                }}>
                    <Text>© {new Date().getFullYear()} OpenCouncil. All rights reserved.</Text>
                    <Text>Ψηφιακή Δημοκρατία</Text>
                </Section>
            </Container>
        </Body>
    </Html>
); 