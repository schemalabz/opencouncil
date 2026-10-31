jest.mock('@/auth', () => ({
  signIn: jest.fn(),
}));

import { signIn } from '@/auth';
import { signInWithEmail } from '../serverSignIn';

describe('signInWithEmail', () => {
  const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue('https://opencouncil.gr/api/auth/verify-request?provider=resend&type=email');
  });

  it('defaults redirectTo to /sign-in when no callbackUrl is provided', async () => {
    const formData = new FormData();
    formData.append('email', 'reader@example.com');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'reader@example.com',
      redirectTo: '/sign-in',
      redirect: false,
    });
  });

  it('uses defaultRedirect when callbackUrl is absent to preserve locale', async () => {
    const formData = new FormData();
    formData.append('email', 'reader@example.com');
    formData.append('defaultRedirect', '/en/sign-in');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'reader@example.com',
      redirectTo: '/en/sign-in',
      redirect: false,
    });
  });

  it('preserves an explicit safe callbackUrl', async () => {
    const formData = new FormData();
    formData.append('email', 'reader@example.com');
    formData.append('callbackUrl', '/chania/meetings/dec23_2025');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'reader@example.com',
      redirectTo: '/chania/meetings/dec23_2025',
      redirect: false,
    });
  });

  it('rejects unsafe external callback URLs and falls back to /sign-in', async () => {
    const formData = new FormData();
    formData.append('email', 'reader@example.com');
    formData.append('callbackUrl', 'https://evil.com/phish');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'reader@example.com',
      redirectTo: '/sign-in',
      redirect: false,
    });
  });

  it('rejects protocol-relative callback URLs and falls back to /sign-in', async () => {
    const formData = new FormData();
    formData.append('email', 'reader@example.com');
    formData.append('callbackUrl', '//malicious.com');

    await signInWithEmail(formData);

    expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'reader@example.com',
      redirectTo: '/sign-in',
      redirect: false,
    });
  });

  it('rejects empty or missing email', async () => {
    const formData = new FormData();
    await expect(signInWithEmail(formData)).rejects.toThrow('Email is required');

    const emptyFormData = new FormData();
    emptyFormData.append('email', '   ');
    await expect(signInWithEmail(emptyFormData)).rejects.toThrow('Email is required');
  });

  it('throws an error when sign-in completes with a failure path', async () => {
    mockSignIn.mockResolvedValueOnce('https://opencouncil.gr/sign-in?error=Configuration');

    const formData = new FormData();
    formData.append('email', 'reader@example.com');

    await expect(signInWithEmail(formData)).rejects.toThrow(
      'Sign-in did not complete (redirected to /sign-in?error=Configuration)',
    );
  });
});
