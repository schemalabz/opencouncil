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
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';
import { emailCopy } from '../copy';

/**
 * The one-line strapline under the footer rule. Localized separately from the
 * body copy because every template shares this chrome; templates that don't
 * pass a locale keep the Greek original.
 */
const TAGLINE: Record<AppLocale, string> = {
    el: 'Ψηφιακή Δημοκρατία',
    en: 'Digital Democracy',
    fr: 'Démocratie numérique',
    sr: 'Дигитална демократија',
    'sr-Latn': 'Digitalna demokratija',
};

interface BaseTemplateProps {
    children: React.ReactNode;
    previewText?: string;
    /** UI locale for the shared chrome; defaults to the app default. */
    locale?: string;
}

export const BaseTemplate = ({
    children,
    locale = DEFAULT_LOCALE,
    // Destructured after `locale` so the default can read it: a template that
    // passes a locale but no preview text still gets its own language.
    previewText = `OpenCouncil - ${emailCopy(TAGLINE, locale, DEFAULT_LOCALE)}`,
}: BaseTemplateProps): React.ReactElement => (
    <Html lang={locale}>
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
                    <Text>{emailCopy(TAGLINE, locale, DEFAULT_LOCALE)}</Text>
                </Section>
            </Container>
        </Body>
    </Html>
); 