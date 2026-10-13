import * as React from 'react';
import { Section, Heading, Text, Button, Hr } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { emailLocaleForRealm, type EmailLocale } from '../emailLocale';
import { emailCopy } from '../copy';

interface ConsultationResponseCopy {
    subject: (consultationTitle: string) => string;
    heading: string;
    greeting: (name: string | null) => string;
    intro: (municipalityName: string, consultationTitle: string, entityLabel: string | null) => string;
    yourComment: string;
    theResponse: string;
    /** The one thing the email exists to say: the conversation goes on by email, not here. */
    continueOutside: string;
    recipientsNote: string;
    cta: string;
    footer: string;
}

/**
 * Copy for the email that carries the municipality's response to a comment. The author gets it,
 * the municipality is in CC, and everyone is in Reply-To: a plain reply from either side reaches
 * the other. Greek is the copy that ships; the other locales exist so a realm on another language
 * fails compilation rather than sending Greek.
 */
const COPY: Record<EmailLocale, ConsultationResponseCopy> = {
    el: {
        subject: (title) => `Απάντηση του Δήμου στο σχόλιό σας — «${title}»`,
        heading: 'Ο Δήμος απάντησε στο σχόλιό σας',
        greeting: (name) => (name ? `Γεια σας ${name},` : 'Γεια σας,'),
        intro: (municipality, title, entity) =>
            `Ο ${municipality} απάντησε στο σχόλιο που αφήσατε στη διαβούλευση «${title}»${entity ? `, για «${entity}»` : ''}.`,
        yourComment: 'Το σχόλιό σας',
        theResponse: 'Η απάντηση του Δήμου',
        continueOutside: 'Η συζήτηση δεν μπορεί να συνεχιστεί μέσα στην πλατφόρμα της διαβούλευσης. Μπορείτε όμως να τη συνεχίσετε μεταξύ σας, απαντώντας σε όλους σε αυτό το email.',
        recipientsNote: 'Το email αυτό πηγαίνει σε εσάς και στον Δήμο. Με «Απάντηση σε όλους» η απάντησή σας φτάνει σε όλους.',
        cta: 'Δείτε το σχόλιο στη διαβούλευση',
        footer: 'Το email στάλθηκε αυτόματα από την πλατφόρμα διαβουλεύσεων του OpenCouncil, εκ μέρους του Δήμου. Για ερωτήσεις και τεχνική υποστήριξη: hello@opencouncil.gr.',
    },
    fr: {
        subject: (title) => `Réponse de la commune à votre commentaire — « ${title} »`,
        heading: 'La commune a répondu à votre commentaire',
        greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
        intro: (municipality, title, entity) =>
            `${municipality} a répondu au commentaire que vous avez laissé dans la consultation « ${title} »${entity ? `, à propos de « ${entity} »` : ''}.`,
        yourComment: 'Votre commentaire',
        theResponse: 'La réponse de la commune',
        continueOutside: "La discussion ne peut pas se poursuivre sur la plateforme de consultation. Vous pouvez toutefois la poursuivre entre vous, en répondant à tous à cet e-mail.",
        recipientsNote: 'Cet e-mail est adressé à vous et à la commune. Avec « Répondre à tous », votre réponse parvient à tout le monde.',
        cta: 'Voir le commentaire dans la consultation',
        footer: "Cet e-mail a été envoyé automatiquement par la plateforme de consultations d'OpenCouncil, au nom de la commune. Questions et assistance technique : hello@opencouncil.gr.",
    },
    sr: {
        subject: (title) => `Одговор општине на ваш коментар — „${title}“`,
        heading: 'Општина је одговорила на ваш коментар',
        greeting: (name) => (name ? `Здраво ${name},` : 'Здраво,'),
        intro: (municipality, title, entity) =>
            `${municipality} је одговорила на коментар који сте оставили у јавној расправи „${title}“${entity ? `, о „${entity}“` : ''}.`,
        yourComment: 'Ваш коментар',
        theResponse: 'Одговор општине',
        continueOutside: 'Разговор не може да се настави унутар платформе за јавну расправу. Можете, међутим, да га наставите међусобно, тако што ћете одговорити свима на овај имејл.',
        recipientsNote: 'Овај имејл је упућен вама и општини. Са „Одговори свима“ ваш одговор стиже до свих.',
        cta: 'Погледајте коментар у јавној расправи',
        footer: 'Овај имејл је аутоматски послат са OpenCouncil платформе за јавне расправе, у име општине. Питања и техничка подршка: hello@opencouncil.gr.',
    },
};

/** The response email's copy for a locale, falling back to the home realm's. */
export function consultationResponseCopy(locale: string): ConsultationResponseCopy {
    return emailCopy(COPY, locale, emailLocaleForRealm('greece'));
}

export interface ConsultationResponseEmailProps {
    authorName: string | null;
    /** "Δήμος Παπάγου - Χολαργού", as the city writes it. */
    municipalityName: string;
    consultationTitle: string;
    entityLabel: string | null;
    /** Both bodies as plain text; blank lines separate paragraphs. */
    commentText: string;
    responseText: string;
    commentUrl: string;
    locale: string;
}

const paragraphStyle = { color: '#1f2937', fontSize: '16px', lineHeight: '24px', margin: '0 0 12px', whiteSpace: 'pre-line' as const };

/** A quoted body, paragraph by paragraph. */
function Quoted({ text }: { text: string }) {
    return (
        <>
            {text.split(/\n{2,}/).map((paragraph, index) => (
                <Text key={index} style={paragraphStyle}>{paragraph}</Text>
            ))}
        </>
    );
}

export const ConsultationResponseEmail = ({
    authorName,
    municipalityName,
    consultationTitle,
    entityLabel,
    commentText,
    responseText,
    commentUrl,
    locale,
}: ConsultationResponseEmailProps): React.ReactElement => {
    const copy = consultationResponseCopy(locale);

    return (
        <BaseTemplate previewText={copy.subject(consultationTitle)} locale={locale}>
            <Section>
                <Heading style={{ color: '#1f2937', fontSize: '22px', fontWeight: '700', margin: '24px 0 16px' }}>
                    {copy.heading}
                </Heading>
                <Text style={{ color: '#4b5563', fontSize: '16px', lineHeight: '24px', margin: '0 0 12px' }}>
                    {copy.greeting(authorName)}
                </Text>
                <Text style={{ color: '#4b5563', fontSize: '16px', lineHeight: '24px', margin: '0 0 20px' }}>
                    {copy.intro(municipalityName, consultationTitle, entityLabel)}
                </Text>
            </Section>

            <Section style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '16px 20px', margin: '0 0 16px' }}>
                <Text style={{ color: '#6b7280', fontSize: '13px', fontWeight: '700', letterSpacing: '0.04em', margin: '0 0 8px', textTransform: 'uppercase' }}>
                    {copy.yourComment}
                </Text>
                <Quoted text={commentText} />
            </Section>

            <Section style={{ backgroundColor: '#fff7ed', borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }}>
                <Text style={{ color: '#9a3412', fontSize: '13px', fontWeight: '700', letterSpacing: '0.04em', margin: '0 0 8px', textTransform: 'uppercase' }}>
                    {copy.theResponse}
                </Text>
                <Quoted text={responseText} />
            </Section>

            <Section>
                <Text style={{ color: '#1f2937', fontSize: '16px', fontWeight: '600', lineHeight: '24px', margin: '0 0 8px' }}>
                    {copy.continueOutside}
                </Text>
                <Text style={{ color: '#6b7280', fontSize: '14px', lineHeight: '20px', margin: '0 0 24px' }}>
                    {copy.recipientsNote}
                </Text>
                <Button
                    href={commentUrl}
                    style={{
                        backgroundColor: '#c2410c',
                        borderRadius: '8px',
                        color: '#ffffff',
                        display: 'inline-block',
                        fontSize: '16px',
                        fontWeight: '700',
                        padding: '12px 24px',
                        textDecoration: 'none',
                    }}
                >
                    {copy.cta}
                </Button>
            </Section>

            <Hr style={{ borderTop: '1px solid #e5e7eb', margin: '32px 0 20px' }} />

            <Section>
                <Text style={{ color: '#9ca3af', fontSize: '12px', lineHeight: '18px', margin: '0' }}>
                    {copy.footer}
                </Text>
            </Section>
        </BaseTemplate>
    );
};
