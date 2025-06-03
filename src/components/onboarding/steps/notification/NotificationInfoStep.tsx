import React from 'react';
import { OnboardingStepTemplate } from '../../OnboardingStepTemplate';
import { OnboardingFooter } from '../../OnboardingFooter';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { PreferencesOverview } from '../../PreferencesOverview';
import { CheckCircle2 } from 'lucide-react';

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
    const existingPreference = userPreferences.notifications.find(pref => 
        pref.cityId === city?.id
    );

    return (
        <OnboardingStepTemplate
            title="Μάθε τι συμβαίνει στον δήμο σου"
            description={
                <div className="space-y-4 text-gray-600">
                    <p>
                        Με το OpenCouncil μπορείς να λαμβάνεις προσωποποιημένες ενημερώσεις για τα θέματα που σε ενδιαφέρουν — πριν ή αφού συζητηθούν στο δημοτικό συμβούλιο.
                    </p>
                    {!existingPreference && (
                        <p>
                            Στα επόμενα βήματα, θα επιλέξεις τις περιοχές και τα θέματα που σε ενδιαφέρουν. Με βάση αυτές τις επιλογές, θα λαμβάνεις ενημερώσεις στο email ή το κινητό σου, με όσα πραγματικά έχουν σημασία για εσένα.
                        </p>
                    )}
                </div>
            }
            footer={
                <OnboardingFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onBack={onBack}
                    onAction={onContinue}
                    actionLabel={existingPreference ? "Ενημέρωση" : "Συνέχεια"}
                />
            }
        >
            {existingPreference && (
                <div className="space-y-6 mt-6">
                    <div className="flex items-center gap-2 text-green-700 mb-4">
                        <CheckCircle2 className="h-5 w-5" />
                        <h3 className="font-medium">Έχετε ήδη εγγραφεί για ειδοποιήσεις</h3>
                    </div>

                    <PreferencesOverview
                        locations={existingPreference.locations}
                        topics={existingPreference.topics}
                    />

                    <div className="text-center">
                        <p className="text-sm text-gray-600 mb-4">
                            Μπορείτε να ενημερώσετε τις προτιμήσεις σας επιλέγοντας νέες τοποθεσίες και θέματα.
                        </p>
                    </div>
                </div>
            )}
        </OnboardingStepTemplate>
    );
} 