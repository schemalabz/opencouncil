import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStage } from '@/lib/types/onboarding';
import { Home, Mail, Bell } from 'lucide-react';
import { OnboardingStepTemplate } from './OnboardingStepTemplate';
import { findOsektutuNeighbourhood } from '@/lib/osektutu';
import { OsektutuBanner } from './OsektutuBanner';
import { useTranslations, useLocale } from 'next-intl';

export function CompleteStep() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { stage, city, selectedLocations } = useOnboarding();
  const t = useTranslations('Onboarding.complete');
  const locale = useLocale();
  const municipalityName = (locale === 'en' ? city?.name_municipality_en : city?.name_municipality) ?? '';

  const isPetitionFlow = stage === OnboardingStage.PETITION_COMPLETE;

  // Surface the osektutu promo when one of the selected locations falls inside an
  // active osektutu neighbourhood (notification flow only). See issue #416.
  const osektutuNeighbourhood = isPetitionFlow
    ? null
    : findOsektutuNeighbourhood(selectedLocations);

  const handleHomeClick = () => {
    router.push('/');
  };

  const getTitle = () => {
    if (isPetitionFlow) {
      return t('petitionTitle');
    }
    return sessionStatus === 'authenticated'
      ? t('updatedTitle')
      : t('registeredTitle');
  };

  const getDescription = () => {
    if (isPetitionFlow) {
      return t('petitionDescription', { city: municipalityName });
    }
    return sessionStatus === 'authenticated'
      ? undefined
      : t('confirmEmail');
  };

  const footer = (
    <div className="p-4">
      <Button
        variant="default"
        className="w-full"
        onClick={handleHomeClick}
      >
        <Home className="h-4 w-4 mr-2" />
        {t('returnHome')}
      </Button>
    </div>
  );

  return (
    <OnboardingStepTemplate
      title={getTitle()}
      description={getDescription()}
      footer={footer}
    >
      <div className="text-center">
        {!isPetitionFlow && (
          <div className="bg-gray-50 rounded-lg p-4 mb-3 text-left">
            <h3 className="font-medium mb-2">{t('whatsNext')}</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Bell className="h-5 w-5 mt-0.5 shrink-0 text-gray-400" />
                <span>{t('notifyItem')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="h-5 w-5 mt-0.5 shrink-0 text-gray-400" />
                <span>
                  {t.rich('manageNotifications', {
                    link: (chunks) =>
                      sessionStatus === 'authenticated' ? (
                        <Link
                          href="/profile?tab=notifications"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {chunks}
                        </Link>
                      ) : (
                        <>{chunks}</>
                      ),
                  })}
                </span>
              </li>
            </ul>
          </div>
        )}
        {osektutuNeighbourhood && city && (
          <OsektutuBanner neighbourhood={osektutuNeighbourhood} cityId={city.id} />
        )}
      </div>
    </OnboardingStepTemplate>
  );
} 