import React, { useState } from 'react';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { UserInfoForm, UserInfoFormData } from '@/components/onboarding/UserInfoForm';

interface PetitionFormStepProps {
  currentStep: number;
  totalSteps: number;
  onContinue: (data: { name: string; isResident: boolean; isCitizen: boolean }) => void;
  onBack: () => void;
  isSubmitting?: boolean;
  initial?: { name?: string; isResident?: boolean; isCitizen?: boolean };
  city: {
    name_municipality: string;
  };
}

export function PetitionFormStep({ currentStep, totalSteps, onContinue, onBack, isSubmitting, initial, city }: PetitionFormStepProps) {
  const [isResident, setIsResident] = useState(initial?.isResident || false);
  const [isCitizen, setIsCitizen] = useState(initial?.isCitizen || false);
  const [checkboxError, setCheckboxError] = useState<string | null>(null);

  const handleSubmit = (formData: UserInfoFormData) => {
    // Validate checkboxes
    if (!isResident && !isCitizen) {
      setCheckboxError('Παρακαλώ επιλέξτε τουλάχιστον μία σχέση με τον δήμο');
      return;
    }
    setCheckboxError(null);

    onContinue({
      name: formData.name,
      isResident,
      isCitizen
    });
  };

  return (
    <OnboardingStepTemplate
      title="Συμπληρώστε τα στοιχεία σας"
      description={
        <p className="text-gray-700 text-left">
          Βοηθήστε μας να φέρουμε το OpenCouncil στον δήμο σας.
        </p>
      }
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={() => {
            const form = document.querySelector('form');
            if (form) form.requestSubmit();
          }}
          actionLabel={isSubmitting ? 'Συνέχεια...' : 'Συνέχεια'}
          isActionDisabled={isSubmitting}
        />
      }
    >
      <div className="space-y-6">
        <UserInfoForm
          onSubmit={handleSubmit}
          initialData={{
            name: initial?.name || ''
          }}
          isSubmitting={isSubmitting}
          showName={true}
          showEmail={false}
          showPhone={false}
          requireName={true}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium">Σχέση με τον δήμο</p>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isResident"
              checked={isResident}
              onCheckedChange={(checked) => setIsResident(checked === true)}
            />
            <Label htmlFor="isResident" className="text-sm">Είμαι κάτοικος</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isCitizen"
              checked={isCitizen}
              onCheckedChange={(checked) => setIsCitizen(checked === true)}
            />
            <Label htmlFor="isCitizen" className="text-sm">Είμαι δημότης</Label>
          </div>

          {checkboxError && <p className="text-red-500 text-sm">{checkboxError}</p>}
        </div>
      </div>
    </OnboardingStepTemplate>
  );
} 