jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    verificationToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../email/resend', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('@react-email/render', () => ({
  render: jest.fn(),
}));

jest.mock('../email/templates/user-invite', () => ({
  UserInviteEmail: jest.fn(() => null),
}));

jest.mock('../../env.mjs', () => ({
  env: {
    NEXTAUTH_URL: 'https://app.test',
  },
}));

import prisma from '../db/prisma';
import { sendEmail } from '../email/resend';
import { render } from '@react-email/render';
import { generateSignInLink, sendInviteEmail } from '../auth/invite';

const mockCreate = prisma.verificationToken.create as jest.MockedFunction<typeof prisma.verificationToken.create>;
const mockDeleteMany = prisma.verificationToken.deleteMany as jest.MockedFunction<typeof prisma.verificationToken.deleteMany>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockRender = render as jest.MockedFunction<typeof render>;

describe('generateSignInLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({} as never);
  });

  it('persists a verificationToken with a 24-hour expiry', async () => {
    const before = Date.now();
    await generateSignInLink('user@example.com');
    const after = Date.now();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const { data } = mockCreate.mock.calls[0][0] as { data: { identifier: string; token: string; expires: Date } };
    expect(data.identifier).toBe('user@example.com');
    expect(typeof data.token).toBe('string');
    expect(data.token).toHaveLength(64); // randomBytes(32) hex
    const expiresMs = data.expires.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 100);
    expect(expiresMs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 100);
  });

  it('returns a sign-in URL containing the token and encoded email', async () => {
    const { signInUrl, verificationTokenKey } = await generateSignInLink('user+tag@example.com');

    expect(signInUrl).toMatch(/^https:\/\/app\.test\/sign-in\?token=[a-f0-9]{64}&email=/);
    expect(signInUrl).toContain(encodeURIComponent('user+tag@example.com'));
    expect(verificationTokenKey.identifier).toBe('user+tag@example.com');
    expect(verificationTokenKey.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same token in the URL and verificationTokenKey', async () => {
    const { signInUrl, verificationTokenKey } = await generateSignInLink('user@example.com');
    expect(signInUrl).toContain(verificationTokenKey.token);
  });
});

describe('sendInviteEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({} as never);
    mockRender.mockResolvedValue('<html>invite</html>');
    mockSendEmail.mockResolvedValue({ success: true, message: 'Email sent successfully' });
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it('returns true when the invite email is sent successfully', async () => {
    const result = await sendInviteEmail('user@example.com', 'Alice');
    expect(result).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const callArg = mockSendEmail.mock.calls[0][0];
    expect(callArg.to).toBe('user@example.com');
    expect(callArg.subject).toBe("Πρόσκληση: Συνδεθείτε στο OpenCouncil");
  });

  it('falls back to email as name when name is empty', async () => {
    const { UserInviteEmail } = require('../email/templates/user-invite');
    await sendInviteEmail('user@example.com', '');
    expect(UserInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'user@example.com' })
    );
  });

  it('returns false and cleans up the token when sendEmail fails', async () => {
    mockSendEmail.mockResolvedValueOnce({ success: false, message: 'Failed' });

    const result = await sendInviteEmail('fail@example.com', 'Bob');

    expect(result).toBe(false);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    const deleteArg = mockDeleteMany.mock.calls[0][0] as { where: { identifier: string; token: string } };
    expect(deleteArg.where.identifier).toBe('fail@example.com');
    expect(typeof deleteArg.where.token).toBe('string');
  });

  it('returns false and cleans up the token when sendEmail throws', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('network error'));

    const result = await sendInviteEmail('throw@example.com', 'Carol');

    expect(result).toBe(false);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('returns false when token creation fails (no cleanup needed)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db error'));

    const result = await sendInviteEmail('dberror@example.com', 'Dave');

    expect(result).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
    // No token was created, so cleanup should not be attempted
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('returns false gracefully when cleanup also fails', async () => {
    mockSendEmail.mockResolvedValueOnce({ success: false, message: 'Failed' });
    mockDeleteMany.mockRejectedValueOnce(new Error('cleanup error'));

    await expect(sendInviteEmail('fail@example.com', 'Eve')).resolves.toBe(false);
  });
});
