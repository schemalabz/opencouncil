import * as React from 'react';
import { Section, Heading, Text, Button } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';
import { emailCopy } from '../copy';

/**
 * Copy for the magic-link email, per locale.
 *
 * A local table rather than a next-intl catalog because `next-intl/server`
 * imports `next/headers` at module top level (`server/react-server/RequestLocale.js`,
 * pulled in statically by `getConfig`), and this template is rendered from
 * `auth.config.ts`, which `proxy.ts` reaches. Passing an explicit locale to
 * `getTranslations` would skip `getRequestLocale()` at runtime, but the import is
 * unconditional, so the module graph is the problem rather than the call.
 *
 * Note this is *not* about `fs`: Next 16 runs the proxy on the Node runtime.
 *
 * Keyed by `AppLocale` so a new locale fails compilation here until its copy
 * exists — though in practice only realm default locales are reachable, see
 * `localeForRequest`.
 */
const COPY: Record<AppLocale, {
    subject: string;
    heading: string;
    body: string;
    cta: string;
    disclaimer: string;
}> = {
    el: {
        subject: 'Συνδεθείτε στο OpenCouncil',
        heading: 'Καλώς ήρθατε στο OpenCouncil',
        body: 'Πατήστε το παρακάτω κουμπί για να συνδεθείτε στο λογαριασμό σας.',
        cta: 'Σύνδεση',
        disclaimer: 'Αν δεν ζητήσατε εσείς αυτό το email, μπορείτε να το αγνοήσετε με ασφάλεια.',
    },
    en: {
        subject: 'Sign in to OpenCouncil',
        heading: 'Welcome to OpenCouncil',
        body: 'Click the button below to sign in to your account.',
        cta: 'Sign in',
        disclaimer: "If you didn't request this email, you can safely ignore it.",
    },
    fr: {
        subject: 'Connectez-vous à OpenCouncil',
        heading: 'Bienvenue sur OpenCouncil',
        body: 'Cliquez sur le bouton ci-dessous pour vous connecter à votre compte.',
        cta: 'Se connecter',
        disclaimer: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
    },
    sr: {
        subject: 'Пријавите се на OpenCouncil',
        heading: 'Добро дошли на OpenCouncil',
        body: 'Кликните на дугме испод да бисте се пријавили на свој налог.',
        cta: 'Пријавите се',
        disclaimer: 'Уколико сте грешком примили ову поруку, можете је слободно занемарити.',
    },
    'sr-Latn': {
        subject: 'Prijavite se na OpenCouncil',
        heading: 'Dobro došli na OpenCouncil',
        body: 'Kliknite na dugme ispod da biste se prijavili na svoj nalog.',
        cta: 'Prijavite se',
        disclaimer: 'Ukoliko ste greškom primili ovu poruku, možete je slobodno zanemariti.',
    },
};

/**
 * The same email when the link publishes a comment the reader wrote while signed out
 * (submitPendingConsultationComment): they asked to comment, not to sign in.
 */
const CONFIRM_COMMENT_COPY: typeof COPY = {
    el: {
        subject: 'Επιβεβαιώστε το σχόλιό σας',
        heading: 'Ένα βήμα ακόμη',
        body: 'Πατήστε το κουμπί για να δημοσιευτεί το σχόλιό σας στη διαβούλευση και να σταλεί στον Δήμο.',
        cta: 'Δημοσίευση σχολίου',
        disclaimer: 'Αν δεν γράψατε εσείς σχόλιο, αγνοήστε αυτό το email. Τίποτα δεν θα δημοσιευτεί.',
    },
    en: {
        subject: 'Confirm your comment',
        heading: 'One more step',
        body: 'Click the button to publish your comment on the consultation and send it to the municipality.',
        cta: 'Publish comment',
        disclaimer: "If you didn't write a comment, ignore this email. Nothing will be published.",
    },
    fr: {
        subject: 'Confirmez votre commentaire',
        heading: 'Encore une étape',
        body: 'Cliquez sur le bouton pour publier votre commentaire dans la consultation et l’envoyer à la municipalité.',
        cta: 'Publier le commentaire',
        disclaimer: "Si vous n'avez pas écrit de commentaire, ignorez cet e-mail. Rien ne sera publié.",
    },
    sr: {
        subject: 'Потврдите свој коментар',
        heading: 'Још један корак',
        body: 'Кликните на дугме да бисте објавили коментар у јавној расправи и послали га општини.',
        cta: 'Објави коментар',
        disclaimer: 'Ако нисте написали коментар, занемарите ову поруку. Ништа неће бити објављено.',
    },
    'sr-Latn': {
        subject: 'Potvrdite svoj komentar',
        heading: 'Još jedan korak',
        body: 'Kliknite na dugme da biste objavili komentar u javnoj raspravi i poslali ga opštini.',
        cta: 'Objavi komentar',
        disclaimer: 'Ako niste napisali komentar, zanemarite ovu poruku. Ništa neće biti objavljeno.',
    },
};

export type AuthEmailPurpose = 'signIn' | 'confirmComment';

/**
 * What a magic link is for, read from where it lands: a consultation comment view with `posted=1`
 * is the link that publishes a pending comment. Anything else, or an unreadable link, is a sign-in.
 */
export function authEmailPurpose(magicLinkUrl: string): AuthEmailPurpose {
    try {
        const callbackUrl = new URL(magicLinkUrl).searchParams.get('callbackUrl');
        if (!callbackUrl) return 'signIn';
        const target = new URL(callbackUrl, 'https://opencouncil.invalid');
        const isComment = target.pathname.includes('/consultation/')
            && target.searchParams.get('view') === 'comment'
            && target.searchParams.get('posted') === '1';
        return isComment ? 'confirmComment' : 'signIn';
    } catch {
        return 'signIn';
    }
}

/** The auth email's copy for a locale, falling back to the app default. */
export function authEmailCopy(locale: string, purpose: AuthEmailPurpose = 'signIn') {
    return emailCopy(purpose === 'confirmComment' ? CONFIRM_COMMENT_COPY : COPY, locale, DEFAULT_LOCALE);
}

interface AuthEmailProps {
    url: string;
    /** UI locale of the domain the sign-in was requested from. */
    locale: string;
    purpose?: AuthEmailPurpose;
}

export const AuthEmail = ({ url, locale, purpose = 'signIn' }: AuthEmailProps): React.ReactElement => {
    const copy = authEmailCopy(locale, purpose);

    return (
        <BaseTemplate previewText={copy.subject} locale={locale}>
            <Section style={{ textAlign: 'center' }}>
                <Heading
                    style={{
                        color: '#1f2937',
                        fontSize: '24px',
                        fontWeight: '600',
                        margin: '30px 0',
                    }}
                >
                    {copy.heading}
                </Heading>

                <Text
                    style={{
                        color: '#4b5563',
                        fontSize: '16px',
                        margin: '16px 0',
                    }}
                >
                    {copy.body}
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
                    {copy.cta}
                </Button>

                <Text
                    style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        margin: '24px 0',
                    }}
                >
                    {copy.disclaimer}
                </Text>
            </Section>
        </BaseTemplate>
    );
};
