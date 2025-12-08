'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { CityWithGeometry } from '@/lib/db/cities';
import { OnboardingContextType, OnboardingStage } from '@/lib/types/onboarding';
import { saveNotificationPreferences, savePetition, getUserPreferences } from '@/lib/db/notifications';
import { useSession } from 'next-auth/react';
import { createLocation } from '@/lib/db/location';
import { useTranslations } from 'next-intl';

interface OnboardingProviderProps {
    children: ReactNode;
    city: CityWithGeometry;
    initialStage: OnboardingStage;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({
    children,
    city,
    initialStage
}: OnboardingProviderProps) {
    const { data: session } = useSession();
    const t = useTranslations('Onboarding');
    const [stage, setStage] = useState<OnboardingStage>(initialStage);
    const [selectedLocations, setSelectedLocations] = useState<OnboardingContextType['selectedLocations']>([]);
    const [selectedTopics, setSelectedTopics] = useState<OnboardingContextType['selectedTopics']>([]);
    const [userPreferences, setUserPreferences] = useState<OnboardingContextType['userPreferences']>({
        notifications: [],
        petitions: []
    });
    const [isFormVisible, setFormVisible] = useState(true);
    const [isMapVisible, setMapVisible] = useState(true);
    const [isLoading, setLoading] = useState(true);
    const [isUpdating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailExistsError, setEmailExistsError] = useState<string | null>(null);
    const [petitionData, setPetitionData] = useState<OnboardingContextType['petitionData']>({
        name: '',
        isResident: false,
        isCitizen: false
    });

    // Fetch user preferences
    useEffect(() => {
        async function fetchUserPreferences() {
            if (!session?.user) {
                setLoading(false);
                return;
            }

            try {
                const dbPreferences = await getUserPreferences();
                const notifications = dbPreferences
                    .filter(pref => !pref.isPetition)
                    .map(pref => {
                        const validatedLocations = pref.locations?.map(loc => {
                            let coordinates: [number, number] = [0, 0];
                            if (loc.coordinates &&
                                Array.isArray(loc.coordinates) &&
                                loc.coordinates.length === 2) {
                                coordinates = [
                                    Number(loc.coordinates[0]),
                                    Number(loc.coordinates[1])
                                ];
                            }
                            return {
                                ...loc,
                                coordinates
                            };
                        });

                        return {
                            cityId: pref.cityId,
                            city: pref.city,
                            locations: validatedLocations,
                            topics: pref.topics
                        };
                    });

                const petitions = dbPreferences
                    .filter(pref => pref.isPetition && pref.petitionData)
                    .map(pref => ({
                        cityId: pref.cityId,
                        city: pref.city,
                        name: pref.petitionData!.name,
                        isResident: pref.petitionData!.isResident,
                        isCitizen: pref.petitionData!.isCitizen
                    }));

                setUserPreferences({
                    notifications,
                    petitions
                });

                // Only initialize stage and data on first load (when isLoading is true)
                // After that, let the user navigate through the flow without resetting
                if (isLoading) {
                    // Check for existing preferences for this city
                    const existingNotification = notifications.find(pref => pref.cityId === city.id);
                    const existingPetition = petitions.find(pref => pref.cityId === city.id);

                    // If city supports notifications, only check for notification preferences
                    if (city.supportsNotifications) {
                        if (existingNotification) {
                            if (existingNotification.locations) {
                                setSelectedLocations(existingNotification.locations);
                            }
                            if (existingNotification.topics) {
                                setSelectedTopics(existingNotification.topics);
                            }
                            setStage(OnboardingStage.NOTIFICATION_INFO);
                        } else {
                            setStage(initialStage);
                        }
                    } else {
                        // For unsupported cities, check for petition first
                        if (existingPetition) {
                            setPetitionData({
                                name: existingPetition.name,
                                isResident: existingPetition.isResident,
                                isCitizen: existingPetition.isCitizen
                            });
                            setStage(OnboardingStage.PETITION_INFO);
                        } else if (existingNotification) {
                            if (existingNotification.locations) {
                                setSelectedLocations(existingNotification.locations);
                            }
                            if (existingNotification.topics) {
                                setSelectedTopics(existingNotification.topics);
                            }
                            setStage(OnboardingStage.NOTIFICATION_INFO);
                        } else {
                            setStage(initialStage);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching user preferences:', error);
                setError('loadingError');
            } finally {
                setLoading(false);
            }
        }

        fetchUserPreferences();
    }, [city.id, city.supportsNotifications, initialStage, isLoading, session?.user]);

    // Reset error states when stage changes
    const handleStageChange = (newStage: OnboardingStage) => {
        setError(null);
        setEmailExistsError(null);
        setStage(newStage);
    };

    // Handle notification registration
    const handleNotificationRegistration = async (email: string, phone?: string, name?: string) => {
        setUpdating(true);
        setError(null);
        setEmailExistsError(null);

        try {
            // Create new locations in the database first
            const locationPromises = selectedLocations.map(location =>
                createLocation({
                    text: location.text,
                    coordinates: location.coordinates
                })
            );

            const createdLocations = await Promise.all(locationPromises);
            const locationIds = createdLocations.map(location => location.id);

            // Get topic IDs
            const topicIds = selectedTopics.map(topic => topic.id);

            // Submit notification preferences
            const result = await saveNotificationPreferences({
                cityId: city.id,
                locationIds,
                topicIds,
                email: session?.user?.email || email,
                phone,
                name: session?.user?.name || name
            });

            if (result.error) {
                if (result.error === "email_exists") {
                    setEmailExistsError(session?.user?.email || email);
                } else {
                    setError('genericError');
                }
            } else {
                // Move to completion stage
                setStage(OnboardingStage.NOTIFICATION_COMPLETE);
            }
        } catch (error: any) {
            console.error('Error saving notification preferences:', error);
            setError('genericError');
        } finally {
            setUpdating(false);
        }
    };

    // Handle petition registration
    const handlePetitionRegistration = async (email: string, phone?: string) => {
        setUpdating(true);
        setError(null);
        setEmailExistsError(null);

        try {
            // Submit petition data
            const result = await savePetition({
                cityId: city.id,
                isResident: petitionData.isResident,
                isCitizen: petitionData.isCitizen,
                email: session?.user?.email || email,
                phone,
                name: petitionData.name
            });

            if (result.error) {
                if (result.error === "email_exists") {
                    setEmailExistsError(session?.user?.email || email);
                } else {
                    setError('genericError');
                }
            } else {
                // Move to completion stage
                setStage(OnboardingStage.PETITION_COMPLETE);
            }
        } catch (error: any) {
            console.error('Error saving petition:', error);
            setError('genericError');
        } finally {
            setUpdating(false);
        }
    };

    // Don't render children until initial loading is complete
    if (isLoading) {
        return (
            <OnboardingContext.Provider
                value={{
                    city,
                    stage,
                    selectedLocations,
                    selectedTopics,
                    userPreferences,
                    isFormVisible,
                    isMapVisible,
                    isLoading,
                    isUpdating,
                    error,
                    emailExistsError,
                    petitionData,
                    setStage: handleStageChange,
                    setSelectedLocations,
                    setSelectedTopics,
                    setPetitionData,
                    setUserPreferences,
                    setFormVisible,
                    setMapVisible,
                    setLoading,
                    setUpdating,
                    setError,
                    setEmailExistsError,
                    handleNotificationRegistration,
                    handlePetitionRegistration
                }}
            >
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
            </OnboardingContext.Provider>
        );
    }

    return (
        <OnboardingContext.Provider
            value={{
                // State values
                city,
                stage,
                selectedLocations,
                selectedTopics,
                userPreferences,
                isFormVisible,
                isMapVisible,
                isLoading,
                isUpdating,
                error,
                emailExistsError,
                petitionData,

                // State setters
                setStage: handleStageChange,
                setSelectedLocations,
                setSelectedTopics,
                setPetitionData,
                setUserPreferences,
                setFormVisible,
                setMapVisible,
                setLoading,
                setUpdating,
                setError,
                setEmailExistsError,

                // Registration handlers
                handleNotificationRegistration,
                handlePetitionRegistration
            }}
        >
            {children}
        </OnboardingContext.Provider>
    );
}

export function useOnboarding() {
    const context = useContext(OnboardingContext);
    if (context === undefined) {
        throw new Error('useOnboarding must be used within an OnboardingProvider');
    }
    return context;
} 