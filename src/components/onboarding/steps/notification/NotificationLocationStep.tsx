'use client';

import React, { useEffect, useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import { Location } from '@/lib/types/onboarding';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { getSubjectsNearLocations, NearbySubject } from '@/lib/actions';
import { Loader2 } from 'lucide-react';

interface NotificationLocationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
}

export function NotificationLocationStep({ currentStep, totalSteps, onBack, onContinue }: NotificationLocationStepProps) {
  const {
    city,
    selectedLocations,
    setSelectedLocations,
  } = useOnboarding();

  const [nearbySubjects, setNearbySubjects] = useState<NearbySubject[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  useEffect(() => {
    if (selectedLocations.length === 0) {
      setNearbySubjects([]);
      return;
    }

    setIsLoadingSubjects(true);
    getSubjectsNearLocations(selectedLocations.map(l => l.coordinates))
      .then(setNearbySubjects)
      .finally(() => setIsLoadingSubjects(false));
  }, [selectedLocations]);

  if (!city) return null;

  const handleLocationSelect = (location: Location) => {
    setSelectedLocations([...selectedLocations, location]);
  };

  const handleLocationRemove = (index: number) => {
    setSelectedLocations(selectedLocations.filter((_, i) => i !== index));
  };

  return (
    <OnboardingStepTemplate
      title="Σε ενδιαφέρει κάποια τοποθεσία;"
      description={`Επιλέξτε τοποθεσίες στον δήμο για τις οποίες θέλετε να λαμβάνετε ενημερώσεις`}
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={onContinue}
          actionLabel="Επόμενο βήμα"
        />
      }
    >
      <div className="flex flex-col gap-6 w-full">
        <LocationSelector
          selectedLocations={selectedLocations}
          onSelect={handleLocationSelect}
          onRemove={handleLocationRemove}
          city={city}
        />

        {selectedLocations.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">
              Θέματα που συζητήθηκαν κοντά στις τοποθεσίες σας
            </div>
            {isLoadingSubjects ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : nearbySubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Δεν βρέθηκαν θέματα κοντά στις επιλεγμένες τοποθεσίες.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {nearbySubjects.map(subject => (
                  <li
                    key={subject.id}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    {subject.topic && (
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: subject.topic.colorHex }}
                      />
                    )}
                    <span className="flex-1 truncate">{subject.name}</span>
                    {subject.meetingDate && (
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {new Date(subject.meetingDate).toLocaleDateString('el-GR', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </OnboardingStepTemplate>
  );
}
