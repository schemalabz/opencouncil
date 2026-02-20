'use client';

import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { cn } from '@/lib/utils';
import { NotificationLocationStep } from '../steps/notification/NotificationLocationStep';
import { NotificationTopicStep } from '../steps/notification/NotificationTopicStep';
import { NotificationRegistrationStep } from '../steps/notification/NotificationRegistrationStep';
import { PetitionInfoStep } from '../steps/petition/PetitionInfoStep';
import { PetitionRegistrationStep } from '../steps/petition/PetitionRegistrationStep';
import { CompleteStep } from '../CompleteStep';
import { OnboardingStage, getCurrentFlow, getCurrentStep } from '@/lib/types/onboarding';
import { useRouter } from 'next/navigation';
import { useMediaQuery } from '@/hooks/use-media-query';
import { PetitionFormStep } from '../steps/petition/PetitionFormStep';
import { NotificationInfoStep } from '../steps/notification/NotificationInfoStep';

export function FormContainer() {
    const {
        stage,
        isLoading,
        setStage,
        petitionData,
        city,
        isFormVisible,
        setPetitionData,
    } = useOnboarding();
    const router = useRouter();
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    const currentFlow = getCurrentFlow(stage);
    const currentStep = getCurrentStep(stage);

    const handleNext = () => {
        const nextStep = currentFlow.getNextStep(stage);
        if (nextStep) {
            setStage(nextStep);
        }
    };

    const handleBack = () => {
        const prevStep = currentFlow.getPreviousStep(stage);
        if (prevStep) {
            setStage(prevStep);
        } else {
            router.push('/');
        }
    };

    if (!city) {
        return null;
    }

    const renderNotificationStep = () => {
        switch (stage) {
            case OnboardingStage.NOTIFICATION_INFO:
                return (
                    <NotificationInfoStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onBack={handleBack}
                        onContinue={handleNext}
                    />
                );
            case OnboardingStage.NOTIFICATION_LOCATION_SELECTION:
                return (
                    <NotificationLocationStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onBack={handleBack}
                        onContinue={handleNext}
                    />
                );
            case OnboardingStage.NOTIFICATION_TOPIC_SELECTION:
                return (
                    <NotificationTopicStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onBack={handleBack}
                        onContinue={handleNext}
                    />
                );
            case OnboardingStage.NOTIFICATION_REGISTRATION:
                return (
                    <NotificationRegistrationStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onBack={handleBack}
                    />
                );
            case OnboardingStage.NOTIFICATION_COMPLETE:
                return <CompleteStep />;
            default:
                return null;
        }
    };

    const renderPetitionStep = () => {
        switch (stage) {
            case OnboardingStage.PETITION_INFO:
                return (
                    <PetitionInfoStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onContinue={handleNext}
                        onBack={handleBack}
                        city={{
                            id: city.id,
                            name_municipality: city.name_municipality
                        }}
                    />
                );
            case OnboardingStage.PETITION_FORM:
                return (
                    <PetitionFormStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onContinue={(data) => {
                            setPetitionData(data);
                            handleNext();
                        }}
                        onBack={handleBack}
                        initial={petitionData}
                        city={{
                            name_municipality: city.name_municipality
                        }}
                    />
                );
            case OnboardingStage.PETITION_REGISTRATION:
                return (
                    <PetitionRegistrationStep
                        currentStep={currentFlow.getProgressStepIndex(stage)}
                        totalSteps={currentFlow.getProgressStepCount()}
                        onBack={handleBack}
                    />
                );
            case OnboardingStage.PETITION_COMPLETE:
                return <CompleteStep />;
            default:
                return null;
        }
    };

    const renderStep = () => {
        if (!currentStep) return null;
        return currentFlow.type === 'notification' ? renderNotificationStep() : renderPetitionStep();
    };

    if (!isFormVisible) return null;

    return (
        <div
            className={cn(
                "absolute z-10 transition-all duration-300 ease-in-out",
                "fixed top-20 md:top-24 bottom-4 md:bottom-8 mx-auto w-[95%] md:w-[90%] max-w-md rounded-xl shadow-2xl overflow-hidden bg-white/95 backdrop-blur-sm",
                isDesktop ? "left-4" : "left-1/2 -translate-x-1/2",
                "safe-area-inset-top safe-area-inset-bottom"
            )}
        >
            <div className={cn(
                "w-full h-full",
                !isDesktop && "space-y-6"
            )}>
                {isLoading ? (
                    <div className="w-full h-40 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="w-full h-full">
                        {renderStep()}
                    </div>
                )}
            </div>
        </div>
    );
} 