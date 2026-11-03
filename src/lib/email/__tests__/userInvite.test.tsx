/** The three emails about a grant (#875): what each one says, in the language of the realm. */
import { renderToStaticMarkup } from 'react-dom/server';
import { UserInviteEmail, userInviteCopy, type UserInviteEmailProps } from '../templates/user-invite';

const base: UserInviteEmailProps = {
    locale: 'en',
    realm: 'greece',
    email: 'clerk@example.org',
    name: 'Clerk',
    invitedBy: 'Mayor',
    grant: { role: 'records', scopeName: 'Youth Council, Chania', path: '/chania/meetings' },
    pending: true,
    url: 'https://opencouncil.gr/sign-in?email=clerk%40example.org',
};

describe('UserInviteEmail', () => {
    it('invites with the sender, the role and the scope, and tells the reader which address to sign in with', () => {
        const { subject, element } = UserInviteEmail(base);
        const html = renderToStaticMarkup(element);
        expect(subject).toBe('Invitation: Youth Council, Chania on OpenCouncil');
        expect(html).toContain('Mayor invites you');
        expect(html).toContain('Records');
        expect(html).toContain('clerk@example.org');
        expect(html).toContain('14 days');
        expect(html).toContain(base.url);
    });

    it('tells a holder who signed in before that the role is in force, with no sign-in hint', () => {
        const { subject, element } = UserInviteEmail({ ...base, pending: false, url: 'https://opencouncil.gr/chania/meetings' });
        const html = renderToStaticMarkup(element);
        expect(subject).toBe('New role on OpenCouncil: Youth Council, Chania');
        expect(html).not.toContain('14 days');
        expect(html).toContain('https://opencouncil.gr/chania/meetings');
    });

    it('names no sender when nobody sent it', () => {
        const html = renderToStaticMarkup(UserInviteEmail({ ...base, invitedBy: null }).element);
        expect(html).toContain('You are invited');
        expect(html).not.toContain('Mayor');
    });

    it('asks an account with pending grants to sign in, within the days of the invite', () => {
        const { subject, element } = UserInviteEmail({ ...base, grant: undefined });
        expect(subject).toBe('Invitation to OpenCouncil');
        const html = renderToStaticMarkup(element);
        expect(html).toContain('clerk@example.org');
        expect(html).toContain('14 days');
    });

    it('gives no time limit to an account with nothing pending', () => {
        const html = renderToStaticMarkup(UserInviteEmail({ ...base, grant: undefined, pending: false }).element);
        expect(html).toContain('Sign in with this email address');
        expect(html).not.toContain('14 days');
    });

    it('greets a Greek reader in the vocative', () => {
        const html = renderToStaticMarkup(UserInviteEmail({ ...base, locale: 'el', name: 'Γιώργος' }).element);
        expect(html).toContain('Γεια σας Γιώργο,');
    });

    it('writes Greek by default, and Latin Serbian for sr-Latn', () => {
        expect(UserInviteEmail({ ...base, locale: 'el' }).subject).toBe('Πρόσκληση: Youth Council, Chania στο OpenCouncil');
        expect(UserInviteEmail({ ...base, locale: 'xx' }).subject).toBe('Πρόσκληση: Youth Council, Chania στο OpenCouncil');
        const serbian = UserInviteEmail({ ...base, locale: 'sr-Latn' }).subject;
        expect(serbian).toBe(userInviteCopy('sr-Latn').inviteSubject.replace('{scope}', base.grant!.scopeName));
        expect(serbian).not.toMatch(/[Ѐ-ӿ]/);
    });
});
