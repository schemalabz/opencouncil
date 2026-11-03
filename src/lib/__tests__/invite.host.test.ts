/**
 * The host of the invite link, which needs a production-apex NEXTAUTH_URL to
 * be observable at all: `invite.test.ts` mocks a non-apex host, where every
 * realm keeps it. A session cookie is host-only, so the link must land on
 * the domain the person will work on.
 */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));

import { inviteEmailLink, inviteLink } from '../auth/invite';

describe('inviteLink on a production host', () => {
    it('lands on the domain of the realm of the scope', () => {
        expect(new URL(inviteLink('a@b.c', 'france', '/lyon')).origin).toBe('https://opencouncil.fr');
        expect(new URL(inviteLink('a@b.c', 'greece', '/chania')).origin).toBe('https://opencouncil.gr');
    });

    it('keeps the configured host with no realm', () => {
        expect(new URL(inviteLink('a@b.c', null)).origin).toBe('https://opencouncil.gr');
    });

    it('sends a notice to the scope on the domain of its realm', () => {
        expect(inviteEmailLink({ email: 'a@b.c', realm: 'france', pending: false, grant: { role: 'admin', scopeName: 'Lyon', path: '/lyon' } }))
            .toBe('https://opencouncil.fr/lyon');
    });
});
