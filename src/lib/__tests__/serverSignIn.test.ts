jest.mock('@/auth', () => ({
  signIn: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
  isUserOnboardedByEmail: jest.fn(),
}));

import { signIn } from '@/auth';
import { isUserOnboardedByEmail } from '@/lib/db/users';
import { signInWithEmail } from '../serverSignIn';

describe('signInWithEmail', () => {
  const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;
  const mockIsUserOnboardedByEmail = isUserOnboardedByEmail as jest.MockedFunction<typeof isUserOnboardedByEmail>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue('https://opencouncil.gr/api/auth/verify-request?provider=resend&type=email');
  });

  it('redirects completed onboarded users to homepage by default', async () => {
    mockIsUserOnboardedByEmail.mockResolvedValue(true);

    const formData = new FormData();
    formData.append('email', 'onboarded@example.com');

    await signInWithEmail(formData);

    expect(mockIsUserOnboardedByEmail).toHaveBeenCalledWith('onboarded@example.com');
    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'onboarded@example.com',
      redirectTo: '/',
      redirect: false,
    });
  });

  it('redirects incomplete or new users to /profile by default', async () => {
    mockIsUserOnboardedByEmail.mockResolvedValue(false);

    const formData = new FormData();
    formData.append('email', 'pending@example.com');

    await signInWithEmail(formData);

    expect(mockIsUserOnboardedByEmail).toHaveBeenCalledWith('pending@example.com');
    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'pending@example.com',
      redirectTo: '/profile',
      redirect: false,
    });
  });

  it('preserves an explicit safe callbackUrl regardless of onboarding status', async () => {
    mockIsUserOnboardedByEmail.mockResolvedValue(true);

    const formData = new FormData();
    formData.append('email', 'onboarded@example.com');
    formData.append('callbackUrl', '/chania/meetings/dec23_2025');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'onboarded@example.com',
      redirectTo: '/chania/meetings/dec23_2025',
      redirect: false,
    });
  });

  it('rejects unsafe external callback URLs and falls back to / for onboarded users', async () => {
    mockIsUserOnboardedByEmail.mockResolvedValue(true);

    const formData = new FormData();
    formData.append('email', 'onboarded@example.com');
    formData.append('callbackUrl', 'https://evil.com/phish');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'onboarded@example.com',
      redirectTo: '/',
      redirect: false,
    });
  });

  it('rejects unsafe external callback URLs and falls back to /profile for pending users', async () => {
    mockIsUserOnboardedByEmail.mockResolvedValue(false);

    const formData = new FormData();
    formData.append('email', 'pending@example.com');
    formData.append('callbackUrl', '//malicious.com');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'pending@example.com',
      redirectTo: '/profile',
      redirect: false,
    });
  });

  it('rejects empty or missing email', async () => {
    const formData = new FormData();
    await expect(signInWithEmail(formData)).rejects.toThrow('Email is required');
  });
});
