import { CityWithGeometry } from '@/lib/db/cities';
import { Topic } from '@prisma/client';

export type Location = {
    id?: string;
    text: string;
    coordinates: [number, number];
};

export enum OnboardingStage {
    // Notification Flow
    NOTIFICATION_INFO = 'NOTIFICATION_INFO',
    NOTIFICATION_LOCATION_SELECTION = 'NOTIFICATION_LOCATION_SELECTION',
    NOTIFICATION_TOPIC_SELECTION = 'NOTIFICATION_TOPIC_SELECTION',
    NOTIFICATION_REGISTRATION = 'NOTIFICATION_REGISTRATION',
    NOTIFICATION_COMPLETE = 'NOTIFICATION_COMPLETE',
    
    // Petition Flow
    PETITION_INFO = 'PETITION_INFO',
    PETITION_FORM = 'PETITION_FORM',
    PETITION_REGISTRATION = 'PETITION_REGISTRATION',
    PETITION_COMPLETE = 'PETITION_COMPLETE'
}

export type FlowType = 'notification' | 'petition';

export interface FlowStep {
    id: OnboardingStage;
    showInProgress?: boolean;
}

export interface Flow {
    type: FlowType;
    steps: FlowStep[];
    getNextStep: (currentStep: OnboardingStage) => OnboardingStage | undefined;
    getPreviousStep: (currentStep: OnboardingStage) => OnboardingStage | undefined;
    isFirstStep: (step: OnboardingStage) => boolean;
    isLastStep: (step: OnboardingStage) => boolean;
    getProgressStepCount: () => number;
    getProgressStepIndex: (step: OnboardingStage) => number;
}

// Define the notification flow
export const notificationFlow: Flow = {
    type: 'notification',
    steps: [
        { id: OnboardingStage.NOTIFICATION_INFO, showInProgress: false },
        { id: OnboardingStage.NOTIFICATION_LOCATION_SELECTION, showInProgress: true },
        { id: OnboardingStage.NOTIFICATION_TOPIC_SELECTION, showInProgress: true },
        { id: OnboardingStage.NOTIFICATION_REGISTRATION, showInProgress: true },
        { id: OnboardingStage.NOTIFICATION_COMPLETE, showInProgress: false }
    ],
    getNextStep: (currentStep) => {
        const currentIndex = notificationFlow.steps.findIndex(s => s.id === currentStep);
        return currentIndex < notificationFlow.steps.length - 1 ? notificationFlow.steps[currentIndex + 1].id : undefined;
    },
    getPreviousStep: (currentStep) => {
        const currentIndex = notificationFlow.steps.findIndex(s => s.id === currentStep);
        return currentIndex > 0 ? notificationFlow.steps[currentIndex - 1].id : undefined;
    },
    isFirstStep: (step) => step === OnboardingStage.NOTIFICATION_INFO,
    isLastStep: (step) => step === OnboardingStage.NOTIFICATION_COMPLETE,
    getProgressStepCount: () => notificationFlow.steps.filter(step => step.showInProgress).length,
    getProgressStepIndex: (step) => {
        const visibleSteps = notificationFlow.steps.filter(s => s.showInProgress);
        return visibleSteps.findIndex(s => s.id === step);
    }
};

// Define the petition flow
export const petitionFlow: Flow = {
    type: 'petition',
    steps: [
        { id: OnboardingStage.PETITION_INFO, showInProgress: false },
        { id: OnboardingStage.PETITION_FORM, showInProgress: true },
        { id: OnboardingStage.PETITION_REGISTRATION, showInProgress: true },
        { id: OnboardingStage.PETITION_COMPLETE, showInProgress: false }
    ],
    getNextStep: (currentStep) => {
        const currentIndex = petitionFlow.steps.findIndex(s => s.id === currentStep);
        return currentIndex < petitionFlow.steps.length - 1 ? petitionFlow.steps[currentIndex + 1].id : undefined;
    },
    getPreviousStep: (currentStep) => {
        const currentIndex = petitionFlow.steps.findIndex(s => s.id === currentStep);
        return currentIndex > 0 ? petitionFlow.steps[currentIndex - 1].id : undefined;
    },
    isFirstStep: (step) => step === OnboardingStage.PETITION_INFO,
    isLastStep: (step) => step === OnboardingStage.PETITION_COMPLETE,
    getProgressStepCount: () => petitionFlow.steps.filter(step => step.showInProgress).length,
    getProgressStepIndex: (step) => {
        const visibleSteps = petitionFlow.steps.filter(s => s.showInProgress);
        return visibleSteps.findIndex(s => s.id === step);
    }
};

// Helper to get the current flow based on stage
export function getCurrentFlow(stage: OnboardingStage): Flow {
    if (stage === OnboardingStage.PETITION_INFO || 
        stage === OnboardingStage.PETITION_FORM || 
        stage === OnboardingStage.PETITION_REGISTRATION ||
        stage === OnboardingStage.PETITION_COMPLETE) {
        return petitionFlow;
    }
    return notificationFlow;
}

// Helper to get the current step
export function getCurrentStep(stage: OnboardingStage): FlowStep | undefined {
    const flow = getCurrentFlow(stage);
    return flow.steps.find(s => s.id === stage);
}


export interface OnboardingContextType {
    city: CityWithGeometry | null;
    stage: OnboardingStage;
    selectedLocations: Location[];
    selectedTopics: Topic[];
    userPreferences: {
        notifications: {
            cityId: string;
            city: CityWithGeometry;
            locations?: Location[];
            topics?: Topic[];
        }[];
        petitions: {
            cityId: string;
            city: CityWithGeometry;
            name: string;
            isResident: boolean;
            isCitizen: boolean;
        }[];
    };
    isFormVisible: boolean;
    isMapVisible: boolean;
    isLoading: boolean;
    isUpdating: boolean;
    error: string | null;
    emailExistsError: string | null;
    petitionData: {
        name: string;
        isResident: boolean;
        isCitizen: boolean;
    };
    setStage: (stage: OnboardingStage) => void;
    setSelectedLocations: (locations: Location[]) => void;
    setSelectedTopics: (topics: Topic[]) => void;
    setPetitionData: (data: OnboardingContextType['petitionData']) => void;
    setUserPreferences: (preferences: OnboardingContextType['userPreferences']) => void;
    setFormVisible: (visible: boolean) => void;
    setMapVisible: (visible: boolean) => void;
    setLoading: (loading: boolean) => void;
    setUpdating: (updating: boolean) => void;
    setError: (error: string | null) => void;
    setEmailExistsError: (error: string | null) => void;
    handleNotificationRegistration: (email: string, phone?: string, name?: string) => Promise<void>;
    handlePetitionRegistration: (email: string, phone?: string) => Promise<void>;
} 