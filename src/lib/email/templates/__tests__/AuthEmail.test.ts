import { authEmailCopy, authEmailPurpose } from '../AuthEmail';

function magicLink(callbackUrl: string) {
    return `https://opencouncil.gr/api/auth/callback/resend?callbackUrl=${encodeURIComponent(callbackUrl)}&token=t&email=a%40b.gr`;
}

describe('authEmailPurpose', () => {
    it('recognises the link that publishes a pending consultation comment', () => {
        expect(authEmailPurpose(magicLink('https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1&pending=cm123'))).toBe('confirmComment');
        expect(authEmailPurpose(magicLink('/papagos-cholargos/consultation/ses?view=comment&entity=res-1&pending=cm123'))).toBe('confirmComment');
    });

    it('treats every other link as a sign-in', () => {
        expect(authEmailPurpose(magicLink('https://opencouncil.gr/profile'))).toBe('signIn');
        expect(authEmailPurpose(magicLink('https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1'))).toBe('signIn');
        expect(authEmailPurpose(magicLink('https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1&posted=1'))).toBe('signIn');
        expect(authEmailPurpose('https://opencouncil.gr/api/auth/callback/resend?token=t')).toBe('signIn');
        expect(authEmailPurpose('not a url')).toBe('signIn');
    });

    it('gives the confirmation copy in the reader’s language', () => {
        expect(authEmailCopy('el', 'confirmComment').subject).toBe('Επιβεβαιώστε το σχόλιό σας');
        expect(authEmailCopy('el').subject).toBe('Συνδεθείτε στο OpenCouncil');
    });
});
