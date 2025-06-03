import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ErrorMessageProps {
  error?: string | null;
  emailExistsError?: string | null;
}

export function ErrorMessage({ error, emailExistsError }: ErrorMessageProps) {
  const t = useTranslations('Onboarding');

  if (!error && !emailExistsError) return null;

  return (
    <div className="rounded-md bg-red-50 p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-red-700">
            {emailExistsError 
              ? t('errors.emailExists', { email: emailExistsError })
              : t(`errors.${error}`)}
          </p>
        </div>
      </div>
    </div>
  );
} 