import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import type { GrantRole, Realm } from '@prisma/client';
import { BaseTemplate } from '../components/BaseTemplate';
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';
import { emailCopy } from '../copy';
import { getRealmContactPhone } from '@/lib/realm';
import { cyrillicToLatin } from '@/lib/serbian/transliterate';
import { PENDING_GRANT_DAYS } from '@/lib/auth/rights';

/**
 * The email about a grant (#875): an invite to a person who never signed in,
 * a notice to a holder who did, or a bare invite to an account with no grant.
 *
 * A local copy table, as AuthEmail: the email is sent from a route with no
 * next-intl request scope for the reader's language, and the realm of the
 * scope decides it (emailLocaleForRealm). `{name}` placeholders are filled by
 * `fill`; a string is translated whole, so word order stays the writer's.
 */
type Copy = {
    /** The subject and the heading of each of the three emails. */
    inviteSubject: string;
    inviteHeading: string;
    noticeSubject: string;
    noticeHeading: string;
    accountSubject: string;
    accountHeading: string;
    greeting: string;
    /** "{by} invited you ..." and the sentence without a sender. */
    inviteBody: string;
    inviteBodyAnonymous: string;
    noticeBody: string;
    noticeBodyAnonymous: string;
    accountBody: string;
    /** The sign-in instruction of an invite: the same address, and how long the invite holds. */
    signInHint: string;
    inviteCta: string;
    noticeCta: string;
    help: string;
    signature: string;
    roles: Record<GrantRole, string>;
};

const SR: Copy = {
    inviteSubject: 'Позив: {scope} на OpenCouncil',
    inviteHeading: 'Позвани сте на OpenCouncil',
    noticeSubject: 'Нова улога на OpenCouncil: {scope}',
    noticeHeading: 'Имате нову улогу',
    accountSubject: 'Позив на OpenCouncil',
    accountHeading: 'Добро дошли на OpenCouncil',
    greeting: 'Поздрав {name},',
    inviteBody: '{by} вас позива да се придружите тиму {scope} на OpenCouncil, са улогом „{role}“.',
    inviteBodyAnonymous: 'Позвани сте да се придружите тиму {scope} на OpenCouncil, са улогом „{role}“.',
    noticeBody: '{by} вам је дао улогу „{role}“ за {scope} на OpenCouncil. Улога важи од сада.',
    noticeBodyAnonymous: 'Додељена вам је улога „{role}“ за {scope} на OpenCouncil. Улога важи од сада.',
    accountBody: 'Позвани сте на OpenCouncil. Пријавите се са овом адресом е-поште да бисте почели.',
    signInHint: 'Пријавите се са адресом {email} да бисте прихватили позив. Позив важи {days} дана.',
    inviteCta: 'Пријавите се на OpenCouncil',
    noticeCta: 'Отвори {scope}',
    help: 'Ако вам треба помоћ, одговорите на ову поруку или нас позовите на {phone}.',
    signature: 'Срдачан поздрав,\nТим OpenCouncil',
    roles: { admin: 'Администратор', records: 'Записи', meetings: 'Седнице', highlights: 'Истакнути делови', viewer: 'Читалац' },
};

/** Cyrillic to Latin, string by string: the two scripts say the same thing. */
const srLatn = (copy: Copy): Copy => ({
    ...Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, typeof value === 'string' ? cyrillicToLatin(value) : value])),
    roles: Object.fromEntries(Object.entries(copy.roles).map(([role, label]) => [role, cyrillicToLatin(label)])) as Record<GrantRole, string>,
} as Copy);

const COPY: Record<AppLocale, Copy> = {
    el: {
        inviteSubject: 'Πρόσκληση: {scope} στο OpenCouncil',
        inviteHeading: 'Έχετε πρόσκληση στο OpenCouncil',
        noticeSubject: 'Νέος ρόλος στο OpenCouncil: {scope}',
        noticeHeading: 'Έχετε νέο ρόλο',
        accountSubject: 'Πρόσκληση στο OpenCouncil',
        accountHeading: 'Καλώς ήρθατε στο OpenCouncil',
        greeting: 'Γεια σας {name},',
        inviteBody: 'Ο χρήστης {by} σας προσκαλεί στην ομάδα «{scope}» στο OpenCouncil, με τον ρόλο «{role}».',
        inviteBodyAnonymous: 'Έχετε προσκληθεί στην ομάδα «{scope}» στο OpenCouncil, με τον ρόλο «{role}».',
        noticeBody: 'Ο χρήστης {by} σας έδωσε τον ρόλο «{role}» στο «{scope}» στο OpenCouncil. Ο ρόλος ισχύει από τώρα.',
        noticeBodyAnonymous: 'Σας δόθηκε ο ρόλος «{role}» στο «{scope}» στο OpenCouncil. Ο ρόλος ισχύει από τώρα.',
        accountBody: 'Έχετε προσκληθεί στο OpenCouncil. Συνδεθείτε με αυτή τη διεύθυνση email για να ξεκινήσετε.',
        signInHint: 'Συνδεθείτε με τη διεύθυνση {email} για να αποδεχτείτε την πρόσκληση. Η πρόσκληση ισχύει για {days} ημέρες.',
        inviteCta: 'Σύνδεση στο OpenCouncil',
        noticeCta: 'Άνοιγμα: {scope}',
        help: 'Αν χρειάζεστε βοήθεια, απαντήστε σε αυτό το email ή καλέστε μας στο {phone}.',
        signature: 'Με εκτίμηση,\nΗ ομάδα του OpenCouncil',
        roles: { admin: 'Διαχειριστής', records: 'Πρακτικά', meetings: 'Συνεδριάσεις', highlights: 'Στιγμιότυπα', viewer: 'Αναγνώστης' },
    },
    en: {
        inviteSubject: 'Invitation: {scope} on OpenCouncil',
        inviteHeading: 'You are invited to OpenCouncil',
        noticeSubject: 'New role on OpenCouncil: {scope}',
        noticeHeading: 'You have a new role',
        accountSubject: 'Invitation to OpenCouncil',
        accountHeading: 'Welcome to OpenCouncil',
        greeting: 'Hello {name},',
        inviteBody: '{by} invites you to the team of {scope} on OpenCouncil, with the role “{role}”.',
        inviteBodyAnonymous: 'You are invited to the team of {scope} on OpenCouncil, with the role “{role}”.',
        noticeBody: '{by} gave you the role “{role}” on {scope} on OpenCouncil. The role is in force now.',
        noticeBodyAnonymous: 'You were given the role “{role}” on {scope} on OpenCouncil. The role is in force now.',
        accountBody: 'You are invited to OpenCouncil. Sign in with this email address to start.',
        signInHint: 'Sign in with the address {email} to accept the invitation. The invitation holds for {days} days.',
        inviteCta: 'Sign in to OpenCouncil',
        noticeCta: 'Open {scope}',
        help: 'If you need help, reply to this email or call us at {phone}.',
        signature: 'Kind regards,\nThe OpenCouncil team',
        roles: { admin: 'Admin', records: 'Records', meetings: 'Meetings', highlights: 'Highlights', viewer: 'Viewer' },
    },
    fr: {
        inviteSubject: 'Invitation : {scope} sur OpenCouncil',
        inviteHeading: 'Vous êtes invité sur OpenCouncil',
        noticeSubject: 'Nouveau rôle sur OpenCouncil : {scope}',
        noticeHeading: 'Vous avez un nouveau rôle',
        accountSubject: 'Invitation sur OpenCouncil',
        accountHeading: 'Bienvenue sur OpenCouncil',
        greeting: 'Bonjour {name},',
        inviteBody: '{by} vous invite à rejoindre l’équipe de {scope} sur OpenCouncil, avec le rôle « {role} ».',
        inviteBodyAnonymous: 'Vous êtes invité à rejoindre l’équipe de {scope} sur OpenCouncil, avec le rôle « {role} ».',
        noticeBody: '{by} vous a attribué le rôle « {role} » sur {scope} sur OpenCouncil. Le rôle est actif dès maintenant.',
        noticeBodyAnonymous: 'Le rôle « {role} » sur {scope} vous a été attribué sur OpenCouncil. Le rôle est actif dès maintenant.',
        accountBody: 'Vous êtes invité sur OpenCouncil. Connectez-vous avec cette adresse e-mail pour commencer.',
        signInHint: 'Connectez-vous avec l’adresse {email} pour accepter l’invitation. L’invitation est valable {days} jours.',
        inviteCta: 'Se connecter à OpenCouncil',
        noticeCta: 'Ouvrir {scope}',
        help: 'Si vous avez besoin d’aide, répondez à cet e-mail ou appelez-nous au {phone}.',
        signature: 'Cordialement,\nL’équipe OpenCouncil',
        roles: { admin: 'Administrateur', records: 'Procès-verbaux', meetings: 'Séances', highlights: 'Extraits', viewer: 'Lecteur' },
    },
    sr: SR,
    'sr-Latn': srLatn(SR),
};

const fill = (text: string, values: Record<string, string>): string =>
    text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

export type UserInviteEmailProps = {
    locale: string;
    realm: Realm | null;
    /** The address the invite is for: a pending invite tells the reader to sign in with it. */
    email: string;
    name: string;
    invitedBy: string | null;
    grant?: { role: GrantRole; scopeName: string; path: string };
    pending: boolean;
    /** Where the button goes; the caller builds it (inviteEmailLink). */
    url: string;
};

/** The subject and the body of the email, from one copy table, so the two never disagree. */
export function UserInviteEmail(props: UserInviteEmailProps): { subject: string; element: React.ReactElement } {
    const { locale, realm, email, name, invitedBy, grant, pending, url } = props;
    const copy = emailCopy(COPY, locale, DEFAULT_LOCALE);
    const values = {
        name,
        by: invitedBy ?? '',
        scope: grant?.scopeName ?? '',
        role: grant ? copy.roles[grant.role] : '',
        email,
        days: String(PENDING_GRANT_DAYS),
        phone: getRealmContactPhone(realm ?? 'greece'),
    };
    const kind = !grant ? 'account' : pending ? 'invite' : 'notice';
    const subject = fill(copy[`${kind}Subject`], values);
    const heading = fill(copy[`${kind}Heading`], values);
    const body =
        kind === 'account' ? copy.accountBody
            : kind === 'invite' ? (invitedBy ? copy.inviteBody : copy.inviteBodyAnonymous)
                : (invitedBy ? copy.noticeBody : copy.noticeBodyAnonymous);
    const cta = fill(kind === 'notice' ? copy.noticeCta : copy.inviteCta, values);

    const element = (
        <BaseTemplate locale={locale} previewText={subject}>
            <Heading style={h1}>{heading}</Heading>
            <Text style={text}>{fill(copy.greeting, values)}</Text>
            <Text style={text}>{fill(body, values)}</Text>
            {kind !== 'notice' && <Text style={text}>{fill(copy.signInHint, values)}</Text>}
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button href={url} style={button}>{cta}</Button>
            </Section>
            <Text style={muted}>{fill(copy.help, values)}</Text>
            <Text style={text}>
                {copy.signature.split('\n').map((line, index) => (
                    <React.Fragment key={index}>{index > 0 && <br />}{line}</React.Fragment>
                ))}
            </Text>
        </BaseTemplate>
    );
    return { subject, element };
}

/** The copy of a locale, for tests and previews. */
export const userInviteCopy = (locale: string): Copy => emailCopy(COPY, locale, DEFAULT_LOCALE);

const h1 = {
    color: '#111827',
    fontSize: '22px',
    fontWeight: 'bold',
    margin: '24px 0 16px',
    lineHeight: '30px',
};

const text = {
    color: '#1f2937',
    fontSize: '16px',
    lineHeight: '26px',
    margin: '16px 0',
};

const muted = {
    ...text,
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '22px',
};

/** The button of the magic-link email (AuthEmail), so the two sign-in emails look alike. */
const button = {
    backgroundColor: '#2563eb',
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '16px',
    fontWeight: '600',
    padding: '12px 24px',
    textDecoration: 'none',
};
