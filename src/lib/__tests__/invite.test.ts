/**
 * The invite email (#875): the link it carries and what the send reports.
 * NEXTAUTH_URL is a preview-like host here, so every link keeps it; the
 * realm domains are the subject of `invite.host.test.ts`.
 */
jest.mock('../email/resend', () => ({ sendEmail: jest.fn() }));
jest.mock('@react-email/render', () => ({ render: jest.fn() }));
jest.mock('../email/templates/user-invite', () => ({
    UserInviteEmail: jest.fn(() => ({ subject: 'Subject', element: null })),
}));
jest.mock('../../env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://app.test' } }));

import { sendEmail } from '../email/resend';
import { render } from '@react-email/render';
import { UserInviteEmail } from '../email/templates/user-invite';
import { inviteEmailLink, inviteLink, sendInviteEmail, type InviteEmail } from '../auth/invite';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockRender = render as jest.MockedFunction<typeof render>;
const mockTemplate = UserInviteEmail as jest.MockedFunction<typeof UserInviteEmail>;

const grant = { role: 'records' as const, scopeName: 'Youth Council, Chania', path: '/chania/meetings' };
const invite: InviteEmail = { email: 'clerk@example.org', name: 'Clerk', realm: 'greece', invitedBy: 'Mayor', grant, pending: true };

describe('inviteLink', () => {
    it('opens the sign-in page with the address filled in, and the scope as the callback', () => {
        const url = new URL(inviteLink('user+tag@example.com', 'greece', '/chania/meetings'));
        expect(url.origin + url.pathname).toBe('https://app.test/sign-in');
        expect(url.searchParams.get('email')).toBe('user+tag@example.com');
        expect(url.searchParams.get('callbackUrl')).toBe('/chania/meetings');
    });

    it('carries no callback for the root', () => {
        expect(inviteLink('a@b.c', null)).toBe('https://app.test/sign-in?email=a%40b.c');
    });
});

describe('inviteEmailLink', () => {
    it('sends a pending invite to the sign-in page', () => {
        expect(inviteEmailLink(invite)).toBe('https://app.test/sign-in?email=clerk%40example.org&callbackUrl=%2Fchania%2Fmeetings');
    });

    it('sends a notice straight to the scope', () => {
        expect(inviteEmailLink({ ...invite, pending: false })).toBe('https://app.test/chania/meetings');
    });

    it('sends an invite with no grant to the sign-in page, with no callback', () => {
        expect(inviteEmailLink({ email: 'a@b.c', realm: null, pending: true })).toBe('https://app.test/sign-in?email=a%40b.c');
    });
});

describe('sendInviteEmail', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRender.mockResolvedValue('<html>invite</html>');
        mockSendEmail.mockResolvedValue({ success: true, message: 'Email sent successfully' });
    });

    it('renders the template in the language of the realm and sends it to the address', async () => {
        await expect(sendInviteEmail({ ...invite, realm: 'france' })).resolves.toBe(true);
        expect(mockTemplate).toHaveBeenCalledWith({
            locale: 'fr',
            realm: 'france',
            email: 'clerk@example.org',
            name: 'Clerk',
            invitedBy: 'Mayor',
            grant,
            pending: true,
            url: 'https://app.test/sign-in?email=clerk%40example.org&callbackUrl=%2Fchania%2Fmeetings',
        });
        expect(mockSendEmail).toHaveBeenCalledWith({ from: 'auth', to: 'clerk@example.org', subject: 'Subject', html: '<html>invite</html>' });
    });

    it('falls back to Greek with no realm, and to the address with no name', async () => {
        await sendInviteEmail({ ...invite, realm: null, name: null });
        expect(mockTemplate).toHaveBeenCalledWith(expect.objectContaining({ locale: 'el', name: 'clerk@example.org' }));
    });

    it('reports a send that failed', async () => {
        mockSendEmail.mockResolvedValueOnce({ success: false, message: 'Failed' });
        await expect(sendInviteEmail(invite)).resolves.toBe(false);
    });

    it('reports a send that threw', async () => {
        mockSendEmail.mockRejectedValueOnce(new Error('network error'));
        await expect(sendInviteEmail(invite)).resolves.toBe(false);
    });
});
