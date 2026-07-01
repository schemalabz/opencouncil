import React from 'react';
import { OnboardingStepTemplate } from '../../OnboardingStepTemplate';
import { OnboardingFooter } from '../../OnboardingFooter';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { PreferencesOverview } from '../../PreferencesOverview';
import { CheckCircle2, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface NotificationInfoStepProps {
    currentStep: number;
    totalSteps: number;
    onBack: () => void;
    onContinue: () => void;
}

export function NotificationInfoStep({
    currentStep,
    totalSteps,
    onBack,
    onContinue
}: NotificationInfoStepProps) {
    const { userPreferences, city } = useOnboarding();
    const t = useTranslations('Onboarding');
    const existingPreference = userPreferences.notifications.find(pref =>
        pref.cityId === city?.id
    );

    return (
        <OnboardingStepTemplate
            title={t('notification.infoTitle')}
            description={
                <div className="space-y-4 text-gray-600">
                    <p>
                        {t('notification.infoBody1')}
                    </p>
                    {!existingPreference && (
                        <p>
                            {t('notification.infoBody2')}
                        </p>
                    )}
                    <p className="flex items-start gap-2 text-sm">
                        <Bell aria-hidden="true" className="h-4 w-4 flex-none mt-0.5" />
                        <span>{t('sendTiming')}</span>
                    </p>
                </div>
            }
            footer={
                <OnboardingFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onBack={onBack}
                    onAction={onContinue}
                    actionLabel={existingPreference ? t('update') : t('next')}
                />
            }
        >
            {existingPreference && (
                <div className="space-y-6 mt-6">
                    <div className="flex items-center gap-2 text-green-700 mb-4">
                        <CheckCircle2 className="h-5 w-5" />
                        <h3 className="font-medium">{t('notification.alreadySubscribedTitle')}</h3>
                    </div>

                    <PreferencesOverview
                        locations={existingPreference.locations}
                        topics={existingPreference.topics}
                    />

                    <div className="text-center">
                        <p className="text-sm text-gray-600 mb-4">
                            {t('notification.updatePreferencesNote')}
                        </p>
                    </div>
                </div>
            )}
        </OnboardingStepTemplate>
    );
} 