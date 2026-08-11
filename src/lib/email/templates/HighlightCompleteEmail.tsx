import * as React from 'react';
import { Section, Heading, Text, Button, Hr } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { emailLocaleForRealm, type EmailLocale } from '../emailLocale';
import { emailCopy } from '../copy';

interface HighlightCompleteCopy {
    subjectSuccess: string;
    subjectFailure: string;
    headingSuccess: string;
    headingFailure: string;
    greeting: (name: string) => string;
    bodySuccess: string;
    bodyFailure: string;
    detailsHeading: string;
    labelTitle: string;
    labelMeeting: string;
    labelCity: string;
    labelDuration: string;
    ctaSuccess: string;
    ctaFailure: string;
    noteSuccess: string;
    noteFailure: string;
    thanks: string;
    /** Fallbacks for a highlight/meeting with no stored name. */
    untitled: string;
    meetingOn: (date: string) => string;
}

/**
 * Copy for the "your highlight is ready" email, per locale.
 *
 * A local table for consistency with the auth email rather than out of necessity:
 * this one renders from a plain route handler, which `next/headers` is fine in,
 * and `getTranslations({ locale })` short-circuits `getRequestLocale()` when given
 * a locale — `lib/mcp/data.ts` already relies on that. So a future third email
 * could legitimately live in `messages/` instead; only the auth email is forced
 * out of it by the proxy's module graph.
 */
const COPY: Record<EmailLocale, HighlightCompleteCopy> = {
    el: {
        subjectSuccess: 'Το Στιγμιότυπο σας είναι έτοιμο!',
        subjectFailure: 'Πρόβλημα με τη δημιουργία Στιγμιότυπου',
        headingSuccess: '✓ Το Στιγμιότυπο σας είναι έτοιμο!',
        headingFailure: '✕ Πρόβλημα με τη δημιουργία',
        greeting: (name) => `Γεια σας ${name},`,
        bodySuccess: 'Το βίντεο στιγμιότυπο σας δημιουργήθηκε επιτυχώς και είναι έτοιμο για προβολή!',
        bodyFailure: 'Δυστυχώς, αντιμετωπίσαμε ένα πρόβλημα κατά τη δημιουργία του βίντεο στιγμιότυπου σας.',
        detailsHeading: 'Λεπτομέρειες Στιγμιότυπου',
        labelTitle: 'Τίτλος',
        labelMeeting: 'Συνεδρίαση',
        labelCity: 'Δήμος',
        labelDuration: 'Διάρκεια',
        ctaSuccess: 'Δείτε το Στιγμιότυπο',
        ctaFailure: 'Δοκιμάστε Ξανά',
        noteSuccess: 'Μπορείτε να κατεβάσετε το βίντεο ή να το μοιραστείτε με άλλους από τη σελίδα του στιγμιότυπου.',
        noteFailure: 'Παρακαλούμε δοκιμάστε ξανά να δημιουργήσετε το στιγμιότυπο. Αν το πρόβλημα συνεχιστεί, επικοινωνήστε μαζί μας στο hello@opencouncil.gr',
        thanks: 'Ευχαριστούμε που χρησιμοποιείτε το OpenCouncil!',
        untitled: 'Χωρίς τίτλο',
        meetingOn: (date) => `Συνεδρίαση ${date}`,
    },
    fr: {
        subjectSuccess: 'Votre extrait est prêt !',
        subjectFailure: "Problème lors de la création de votre extrait",
        headingSuccess: '✓ Votre extrait est prêt !',
        headingFailure: '✕ Un problème est survenu',
        greeting: (name) => `Bonjour ${name},`,
        bodySuccess: 'Votre extrait vidéo a été créé avec succès et est prêt à être visionné !',
        bodyFailure: "Malheureusement, nous avons rencontré un problème lors de la création de votre extrait vidéo.",
        detailsHeading: "Détails de l'extrait",
        labelTitle: 'Titre',
        labelMeeting: 'Séance',
        labelCity: 'Commune',
        labelDuration: 'Durée',
        ctaSuccess: "Voir l'extrait",
        ctaFailure: 'Réessayer',
        noteSuccess: "Vous pouvez télécharger la vidéo ou la partager depuis la page de l'extrait.",
        noteFailure: "Veuillez réessayer de créer l'extrait. Si le problème persiste, contactez-nous à hello@opencouncil.gr",
        thanks: "Merci d'utiliser OpenCouncil !",
        untitled: 'Sans titre',
        meetingOn: (date) => `Séance du ${date}`,
    },
    sr: {
        subjectSuccess: 'Ваш истакнути исечак је спреман!',
        subjectFailure: 'Проблем при прављењу истакнутог исечка',
        headingSuccess: '✓ Ваш истакнути исечак је спреман!',
        headingFailure: '✕ Проблем при прављењу',
        greeting: (name) => `Здраво ${name},`,
        bodySuccess: 'Ваш видео-исечак је успешно направљен и спреман је за гледање!',
        bodyFailure: 'Нажалост, наишли смо на проблем при прављењу вашег видео-исечка.',
        detailsHeading: 'Детаљи истакнутог исечка',
        labelTitle: 'Наслов',
        labelMeeting: 'Седница',
        labelCity: 'Град',
        labelDuration: 'Трајање',
        ctaSuccess: 'Погледајте исечак',
        ctaFailure: 'Покушајте поново',
        noteSuccess: 'Са странице исечка можете преузети видео-снимак или га поделити са другима.',
        noteFailure: 'Молимо покушајте поново да направите исечак. Ако се проблем настави, контактирајте нас на hello@opencouncil.gr',
        thanks: 'Хвала што користите OpenCouncil!',
        untitled: 'Без наслова',
        meetingOn: (date) => `Седница ${date}`,
    },
};

/** The highlight email's copy for a locale, falling back to the home realm's. */
export function highlightCompleteCopy(locale: string): HighlightCompleteCopy {
    return emailCopy(COPY, locale, emailLocaleForRealm('greece'));
}

interface HighlightCompleteEmailProps {
    userName: string;
    highlightTitle: string;
    meetingName: string;
    cityName: string;
    duration: string;
    highlightUrl: string;
    status: 'success' | 'failure';
    /** UI locale of the realm the highlight's city belongs to. */
    locale: string;
}

export const HighlightCompleteEmail = ({
    userName,
    highlightTitle,
    meetingName,
    cityName,
    duration,
    highlightUrl,
    status,
    locale
}: HighlightCompleteEmailProps): React.ReactElement => {
    const isSuccess = status === 'success';
    const copy = highlightCompleteCopy(locale);

    return (
        <BaseTemplate
            previewText={isSuccess ? copy.subjectSuccess : copy.subjectFailure}
            locale={locale}
        >
            <Section style={{ textAlign: 'center' }}>
                <Heading
                    style={{
                        color: isSuccess ? '#059669' : '#dc2626',
                        fontSize: '24px',
                        fontWeight: '600',
                        margin: '30px 0 20px',
                    }}
                >
                    {isSuccess ? copy.headingSuccess : copy.headingFailure}
                </Heading>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                    }}
                >
                    {copy.greeting(userName)}
                </Text>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                        lineHeight: '24px',
                    }}
                >
                    {isSuccess ? copy.bodySuccess : copy.bodyFailure}
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
                    {copy.detailsHeading}
                </Heading>

                {[
                    [copy.labelTitle, highlightTitle],
                    [copy.labelMeeting, meetingName],
                    [copy.labelCity, cityName],
                    [copy.labelDuration, duration],
                ].map(([label, value]) => (
                    <Text
                        key={label}
                        style={{
                            color: '#6b7280',
                            fontSize: '14px',
                            margin: '8px 0',
                            lineHeight: '20px',
                        }}
                    >
                        <strong style={{ color: '#374151' }}>{label}:</strong> {value}
                    </Text>
                ))}
            </Section>

            <Section style={{ textAlign: 'center' }}>
                <Button
                    href={highlightUrl}
                    style={{
                        backgroundColor: isSuccess ? '#2563eb' : '#dc2626',
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
                    {isSuccess ? copy.ctaSuccess : copy.ctaFailure}
                </Button>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '24px 0',
                        lineHeight: '20px',
                    }}
                >
                    {isSuccess ? copy.noteSuccess : copy.noteFailure}
                </Text>
            </Section>

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
                    {copy.thanks}
                </Text>
            </Section>
        </BaseTemplate>
    );
};
