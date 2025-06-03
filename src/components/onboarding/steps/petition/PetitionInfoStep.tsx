import React from 'react';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { CheckCircle2 } from 'lucide-react';
import { PreferencesOverview } from '@/components/onboarding/PreferencesOverview';

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
  const existingPetition = userPreferences?.petitions?.find(petition => 
    petition.cityId === city.id
  );

  return (
    <OnboardingStepTemplate
      title={`Ο ${city.name_municipality} δεν είναι ακόμα στο δίκτυο OpenCouncil`}
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={onContinue}
          actionLabel={existingPetition ? "Ενημέρωση" : "Συνέχεια"}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-gray-700 text-left">
          Μπορείτε να μας βοηθήσετε να φέρουμε το δήμο σας στο OpenCouncil, επιτρέποντας μας να χρησιμοποιήσουμε το
          όνομά σας όταν μιλήσουμε με το δήμο, ως δημότη που θα ήθελε να έχει το OpenCouncil στο δήμο του.
        </p>
        {!existingPetition && (
          <p className="text-gray-700 text-left">
            Έχουμε εμπορική δραστηριότητα με τους δήμους που συνεργαζόμαστε. Οι τιμές και ο τρόπος που τιμολογούμε είναι δημόσια διαθέσιμες στο <a href="https://opencouncil.gr/about" className="text-blue-500 hover:underline">opencouncil.gr/about</a>.
          </p>
        )}
      </div>

      {existingPetition && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2 text-green-700 mb-4">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="font-medium">Έχετε ήδη υποστηρίξει την προσθήκη του δήμου</h3>
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
              Σας ευχαριστούμε για την υποστήριξή σας! Θα σας ενημερώσουμε όταν ο δήμος ενταχθεί στο δίκτυο OpenCouncil.
            </p>
          </div>
        </div>
      )}
    </OnboardingStepTemplate>
  );
} 