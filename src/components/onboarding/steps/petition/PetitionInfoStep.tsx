import React from 'react';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { CheckCircle2 } from 'lucide-react';
import { PreferencesOverview } from '@/components/onboarding/PreferencesOverview';
import { useTranslations } from 'next-intl';

interface PetitionInfoStepProps {
  currentStep: number;
  totalSteps: number;
  onContinue: () => void;
  onBack: () => void;
  city: {
    id: string;
    name_municipality: string;
  };
}

export function PetitionInfoStep({ currentStep, totalSteps, onContinue, onBack, city }: PetitionInfoStepProps) {
  const { userPreferences } = useOnboarding();
  const t = useTranslations('Onboarding');
  const existingPetition = userPreferences?.petitions?.find(petition =>
    petition.cityId === city.id
  );

  return (
    <OnboardingStepTemplate
      title={t('petition.infoTitle', { city: city.name_municipality })}
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={onContinue}
          actionLabel={existingPetition ? t('update') : t('next')}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-gray-700 text-left">
          {t('petition.infoBody')}
        </p>
        {!existingPetition && (
          <p className="text-gray-700 text-left">
            {t.rich('petition.pricingNote', {
              link: (chunks) => (
                <a href="https://opencouncil.gr/about" className="text-blue-500 hover:underline">{chunks}</a>
              )
            })}
          </p>
        )}
      </div>

      {existingPetition && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2 text-green-700 mb-4">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="font-medium">{t('petition.alreadySupportedTitle')}</h3>
          </div>

          <PreferencesOverview
            petitionData={{
              name: existingPetition.name,
              isResident: existingPetition.isResident,
              isCitizen: existingPetition.isCitizen
            }}
          />

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {t('petition.thankYou')}
            </p>
          </div>
        </div>
      )}
    </OnboardingStepTemplate>
  );
} 