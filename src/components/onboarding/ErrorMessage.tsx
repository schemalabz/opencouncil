'use client';

import { AlertCircle, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/routing';

interface ErrorMessageProps {
  error?: string | null;
  emailExistsError?: string | null;
}

export function ErrorMessage({ error, emailExistsError }: ErrorMessageProps) {
  const t = useTranslations('Onboarding');
  const pathname = usePathname();

  if (!error && !emailExistsError) return null;

  const signInParams = new URLSearchParams({ callbackUrl: pathname });
  if (emailExistsError) signInParams.set('email', emailExistsError);
  const signInHref = `/sign-in?${signInParams.toString()}`;

  return (
    <div className="rounded-md bg-red-50 p-4 mb-4 border border-red-100">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-700">
            {emailExistsError
              ? t('errors.emailExists', { email: emailExistsError })
              : t(`errors.${error}`)}
          </p>
          {emailExistsError && (
            <Link
              href={signInHref}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-red-700 border border-red-200 shadow-sm hover:bg-red-50 hover:border-red-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 min-h-[40px] touch-manipulation"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t('errors.signInCta')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
