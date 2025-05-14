'use client';

import { useState, useEffect } from 'react';
import Map, { MapFeature } from '@/components/map/map';
import { SignupHeader } from './SignupHeader';
import { MunicipalitySelector } from './MunicipalitySelector';
import { LocationSelector } from './LocationSelector';
import { TopicSelector } from './TopicSelector';
import { UserRegistration } from './UserRegistration';
import { UnsupportedMunicipality } from './UnsupportedMunicipality';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, UserCheck, Pin, Settings, ExternalLink, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { City as PrismaCity, Topic as PrismaTopic } from '@prisma/client';
import { getUserPreferences, saveNotificationPreferences, savePetition, UserPreference as DbUserPreference } from '@/lib/db/notifications';
import { createLocation } from '@/lib/db/location';

// Import SignupStage from SignupHeader component or export it from there
import { SignupStage } from './SignupHeader';

// Extend Prisma types with additional properties needed in the app
export type City = PrismaCity & {
    geometry?: any; // Add geometry which is represented as Unsupported in Prisma
};

// For location data that doesn't exist in Prisma
export type Location = {
    id?: string;
    text: string;
    coordinates: [number, number];
};

// Use Prisma Topic type directly with a new alias
export type AppTopic = PrismaTopic;

// Define user preference data type
export type UserPreference = {
    cityId: string;
    city: City;
    isPetition: boolean;
    petitionData?: PetitionData;
    locations?: Location[];
    topics?: AppTopic[];
};

// Define petition data type
export type PetitionData = {
    name: string;
    isResident: boolean;
    isCitizen: boolean;
    phone?: string;
};

// Utility function to calculate center and zoom from GeoJSON
const calculateMapView = (geometry: any): { center: [number, number]; zoom: number } => {
    if (!geometry) {
        return { center: [23.7275, 37.9838], zoom: 6 }; // Default to Athens
    }

    // Initialize bounds
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    // Extract coordinates based on geometry type
    const processCoordinates = (coords: number[][]) => {
        coords.forEach(point => {
            const [lng, lat] = point;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });
    };

    try {
        if (geometry.type === 'Polygon') {
            // Process outer ring of polygon
            processCoordinates(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            // Process all polygons in the multipolygon
            geometry.coordinates.forEach((polygon: number[][][]) => {
                processCoordinates(polygon[0]);
            });
        } else if (geometry.type === 'Point') {
            // For a point, just use its coordinates
            const [lng, lat] = geometry.coordinates;
            return { center: [lng, lat], zoom: 12 };
        }
    } catch (error) {
        console.error('Error processing geometry:', error);
        return { center: [23.7275, 37.9838], zoom: 6 }; // Default to Athens
    }

    // Calculate center
    const center: [number, number] = [
        (minLng + maxLng) / 2,
        (minLat + maxLat) / 2
    ];

    // Calculate appropriate zoom level based on the area size
    const lngDiff = maxLng - minLng;
    const latDiff = maxLat - minLat;
    const maxDiff = Math.max(lngDiff, latDiff);

    // Simple formula to estimate zoom level - adjust constants as needed
    let zoom = 10; // Default zoom
    if (maxDiff > 0) {
        // The smaller the area, the higher the zoom
        zoom = Math.max(8, Math.min(13, 11 - Math.log2(maxDiff * 111))); // 111km per degree
    }

    return { center, zoom };
};

export function SignupPageContent() {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    // State variables
    const [stage, setStage] = useState<SignupStage>(SignupStage.SELECT_MUNICIPALITY);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<AppTopic[]>([]);
    const [petitionData, setPetitionData] = useState<PetitionData | null>(null);
    const [mapFeatures, setMapFeatures] = useState<MapFeature[]>([]);
    const [mapCenter, setMapCenter] = useState<[number, number]>([23.7275, 37.9838]); // Default to Athens
    const [mapZoom, setMapZoom] = useState<number>(6);
    const [showForm, setShowForm] = useState(true);
    const [userPreferences, setUserPreferences] = useState<UserPreference[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [showMap, setShowMap] = useState(true);
    const [emailExistsError, setEmailExistsError] = useState<string | null>(null);

    // Fetch user's existing preferences/petitions when session is available
    useEffect(() => {
        async function fetchUserPreferences() {
            if (sessionStatus === 'authenticated' && session?.user) {
                setIsLoading(true);
                try {
                    // Fetch user's existing preferences using the server function
                    const dbPreferences = await getUserPreferences();

                    // Map DB preferences to component format and validate coordinates
                    const preferences: UserPreference[] = dbPreferences.map(pref => {
                        // Validate location coordinates if they exist
                        const validatedLocations = pref.locations?.map(loc => {
                            // Ensure coordinates are valid numbers in a tuple
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
                            isPetition: pref.isPetition,
                            petitionData: pref.petitionData,
                            locations: validatedLocations,
                            topics: pref.topics
                        };
                    });

                    console.log('User preferences with validated locations:', preferences);
                    setUserPreferences(preferences);
                } catch (error) {
                    console.error('Error fetching user preferences:', error);
                } finally {
                    setIsLoading(false);
                }
            } else if (sessionStatus === 'unauthenticated') {
                // Not authenticated, so no preferences to fetch
                setIsLoading(false);
            }
        }

        fetchUserPreferences();
    }, [session, sessionStatus]);

    // When city is selected, update map features and center
    useEffect(() => {
        if (selectedCity?.geometry) {
            // Calculate center and zoom based on city geometry
            const { center, zoom } = calculateMapView(selectedCity.geometry);

            // Update map center and zoom
            setMapCenter(center);
            setMapZoom(zoom);

            // Add city boundary as a feature
            setMapFeatures([
                {
                    id: selectedCity.id,
                    geometry: selectedCity.geometry,
                    style: {
                        fillColor: '#627BBC',
                        fillOpacity: 0.2,
                        strokeColor: '#4263EB',
                        strokeWidth: 2
                    }
                }
            ]);
        } else {
            // Reset map when no city is selected
            setMapFeatures([]);
            setMapZoom(6);
            setMapCenter([23.7275, 37.9838]);
        }
    }, [selectedCity]);

    // When locations are selected, add them as map features
    useEffect(() => {
        console.log('Selected locations changed:', selectedLocations);

        if (selectedCity && selectedLocations.length > 0) {
            // Combine city boundary with location points
            const cityFeature = {
                id: selectedCity.id,
                geometry: selectedCity.geometry || null,
                style: {
                    fillColor: '#627BBC',
                    fillOpacity: 0.2,
                    strokeColor: '#4263EB',
                    strokeWidth: 2
                }
            };

            const locationFeatures = selectedLocations.map((location, index) => {
                // Ensure coordinates are valid numbers
                const lng = parseFloat(String(location.coordinates[0]));
                const lat = parseFloat(String(location.coordinates[1]));

                const hasValidCoordinates =
                    !isNaN(lng) && isFinite(lng) &&
                    !isNaN(lat) && isFinite(lat);

                console.log(`Creating map feature for location ${index}:`, {
                    text: location.text,
                    originalCoordinates: location.coordinates,
                    parsedCoordinates: [lng, lat],
                    isValid: hasValidCoordinates
                });

                if (!hasValidCoordinates) {
                    console.warn(`Skipping location ${index} due to invalid coordinates:`, location.coordinates);
                    return null;
                }

                return {
                    id: `location-${index}`, // Use index-based ID for map features
                    geometry: {
                        type: 'Point',
                        coordinates: [lng, lat] as [number, number]
                    },
                    style: {
                        fillColor: '#EF4444',
                        fillOpacity: 0.8,
                        strokeColor: '#B91C1C',
                        strokeWidth: 6
                    }
                };
            }).filter(Boolean); // Remove null entries for invalid locations

            console.log('Setting map features:', [cityFeature, ...locationFeatures]);
            setMapFeatures([cityFeature, ...locationFeatures] as MapFeature[]);
        }
    }, [selectedCity, selectedLocations]);

    // Initialize showForm based on screen size
    useEffect(() => {
        setShowForm(true);
    }, []);

    // Handler for municipality selection
    const handleMunicipalitySelect = (city: City) => {
        setSelectedCity(city);

        // Check if user already has preferences for this city
        const existingPreference = userPreferences.find(pref => pref.cityId === city.id);

        if (existingPreference) {
            // Pre-populate existing preference data
            if (existingPreference.isPetition) {
                // It's a petition
                if (existingPreference.petitionData) {
                    setPetitionData(existingPreference.petitionData);
                }
                setStage(SignupStage.UNSUPPORTED_MUNICIPALITY);
            } else {
                // It's a notification preference
                if (existingPreference.locations) {
                    setSelectedLocations(existingPreference.locations);
                }
                if (existingPreference.topics) {
                    setSelectedTopics(existingPreference.topics);
                }
                setStage(SignupStage.LOCATION_TOPIC_SELECTION);
            }
        } else {
            // Route to appropriate next stage based on city support status
            if (city.supportsNotifications) {
                setStage(SignupStage.LOCATION_TOPIC_SELECTION);
            } else if (city.officialSupport) {
                // If we need to add COMING_SOON_MUNICIPALITY as a stage, add it to SignupHeader.tsx
                setStage(SignupStage.USER_REGISTRATION);
            } else {
                // No official support, allow petition
                setStage(SignupStage.UNSUPPORTED_MUNICIPALITY);
            }
        }
    };

    // Handler for location selection
    const handleLocationSelect = (location: Location) => {
        setSelectedLocations(prev => [...prev, location]);
    };

    // Handler for location removal
    const handleLocationRemove = (index: number) => {
        setSelectedLocations(prev => prev.filter((_, i) => i !== index));
    };

    // Handler for topic selection
    const handleTopicSelect = (topic: AppTopic) => {
        setSelectedTopics(prev => [...prev, topic]);
    };

    // Handler for topic removal
    const handleTopicRemove = (topicId: string) => {
        setSelectedTopics(prev => prev.filter(topic => topic.id !== topicId));
    };

    // Handler for continuing to user registration from location/topic selection
    const handleContinueToRegistration = () => {
        setStage(SignupStage.USER_REGISTRATION);
    };

    // Handler for submitting petition data from unsupported municipality
    const handlePetitionSubmit = (data: PetitionData) => {
        setPetitionData(data);
        // Now move to user registration stage instead of immediately submitting
        setStage(SignupStage.USER_REGISTRATION);
    };

    // Handler for submitting user info - now handles both notification preferences and petitions
    const handleUserRegistration = async (email: string, phone?: string, name?: string) => {
        try {
            setIsUpdating(true);
            setEmailExistsError(null);

            // Clean up the phone number if needed
            const formattedPhone = phone ? phone.trim() : undefined;

            // Check if the user is already authenticated
            const isAuthenticated = sessionStatus === 'authenticated' && session?.user;

            if (petitionData && selectedCity) {
                // Submit petition data
                try {
                    await savePetition({
                        cityId: selectedCity.id,
                        isResident: petitionData.isResident,
                        isCitizen: petitionData.isCitizen,
                        email: isAuthenticated ? undefined : email,
                        phone: formattedPhone,
                        name: petitionData.name
                    });

                    // Move to completion stage
                    setStage(SignupStage.COMPLETE);
                } catch (error: any) {
                    if (error.message === "email_exists") {
                        setEmailExistsError(email);
                        return;
                    }
                    throw error;
                }
            } else if (selectedCity) {
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

                // Submit notification preferences with the newly created locations
                try {
                    await saveNotificationPreferences({
                        cityId: selectedCity.id,
                        locationIds: locationIds,
                        topicIds: topicIds,
                        email: isAuthenticated ? undefined : email,
                        phone: formattedPhone,
                        name
                    });

                    // Move to completion stage
                    setStage(SignupStage.COMPLETE);
                } catch (error: any) {
                    if (error.message === "email_exists") {
                        setEmailExistsError(email);
                        return;
                    }
                    console.error('Error saving notification preferences:', error);
                    throw error;
                }
            } else {
                throw new Error('No city selected');
            }

            // If this was an update and the user is authenticated, refresh the preferences
            if (isAuthenticated) {
                const dbPreferences = await getUserPreferences();
                // Map DB preferences to component format
                const preferences: UserPreference[] = dbPreferences.map(pref => ({
                    cityId: pref.cityId,
                    city: pref.city,
                    isPetition: pref.isPetition,
                    petitionData: pref.petitionData,
                    locations: pref.locations,
                    topics: pref.topics
                }));

                setUserPreferences(preferences);
            }
        } catch (error) {
            console.error('Error submitting data:', error);

            // Show general error to user
            alert('Παρουσιάστηκε σφάλμα. Παρακαλώ δοκιμάστε ξανά.');
        } finally {
            setIsUpdating(false);
        }
    };

    // Handler to sign in with email
    const handleSignIn = (email: string) => {
        signIn("resend", { email }, { callbackUrl: window.location.href });
    };

    // Handle back button
    const handleBack = () => {
        if (stage === SignupStage.LOCATION_TOPIC_SELECTION ||
            stage === SignupStage.UNSUPPORTED_MUNICIPALITY) {
            setStage(SignupStage.SELECT_MUNICIPALITY);
            setSelectedCity(null);
            setPetitionData(null);
            setSelectedLocations([]);
            setSelectedTopics([]);
        } else if (stage === SignupStage.USER_REGISTRATION) {
            if (petitionData) {
                setStage(SignupStage.UNSUPPORTED_MUNICIPALITY);
            } else {
                setStage(SignupStage.LOCATION_TOPIC_SELECTION);
            }
        } else if (stage === SignupStage.COMPLETE) {
            // Navigate home or to appropriate page
            router.push('/');
        }
    };

    // Reset the entire form
    const handleReset = () => {
        setStage(SignupStage.SELECT_MUNICIPALITY);
        setSelectedCity(null);
        setPetitionData(null);
        setSelectedLocations([]);
        setSelectedTopics([]);
    };

    // Toggle form visibility on mobile
    const toggleForm = () => {
        setShowForm(prev => !prev);
    };

    // Handle selecting an existing user preference
    const handleSelectExistingPreference = (preference: UserPreference) => {
        setSelectedCity(preference.city);

        if (preference.isPetition) {
            // It's a petition
            if (preference.petitionData) {
                setPetitionData(preference.petitionData);
            }
            setStage(SignupStage.UNSUPPORTED_MUNICIPALITY);
        } else {
            // It's a notification preference
            if (preference.locations && preference.locations.length > 0) {
                // Process and validate locations to ensure proper coordinate format
                const validatedLocations = preference.locations.map(loc => {
                    // Make sure coordinates is a tuple of two numbers
                    let coordinates: [number, number] = [0, 0];

                    // Check if coordinates exist and are valid
                    if (loc.coordinates &&
                        Array.isArray(loc.coordinates) &&
                        loc.coordinates.length === 2 &&
                        typeof loc.coordinates[0] === 'number' &&
                        typeof loc.coordinates[1] === 'number') {
                        coordinates = [
                            Number(loc.coordinates[0]),
                            Number(loc.coordinates[1])
                        ];
                    }

                    console.log(`Location ${loc.id} coordinates:`, coordinates);

                    return {
                        id: loc.id,
                        text: loc.text,
                        coordinates
                    };
                });

                console.log('Loading existing locations (validated):', validatedLocations);
                setSelectedLocations(validatedLocations);
            }
            if (preference.topics) {
                setSelectedTopics(preference.topics);
            }
            setStage(SignupStage.LOCATION_TOPIC_SELECTION);
        }
    };

    // Determine whether this is for a petition or notification preferences
    const isPetition = petitionData !== null && petitionData !== undefined;

    // Render the appropriate form content based on the current stage
    const renderFormContent = () => {
        switch (stage) {
            case SignupStage.SELECT_MUNICIPALITY:
                return (
                    <div className="space-y-6">
                        <MunicipalitySelector onSelect={handleMunicipalitySelect} />

                        {/* Display existing user preferences when logged in */}
                        {sessionStatus === 'authenticated' && userPreferences.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-lg font-medium mb-3">Οι ενεργές σας εγγραφές</h3>
                                <div className="space-y-2">
                                    {userPreferences.map((preference) => (
                                        <Button
                                            key={preference.cityId}
                                            variant="outline"
                                            className="w-full justify-start py-4 px-3 hover:bg-gray-100"
                                            onClick={() => handleSelectExistingPreference(preference)}
                                        >
                                            <div className="flex items-center gap-3 w-full">
                                                {preference.isPetition ? (
                                                    <UserCheck className="h-5 w-5 text-blue-500 flex-shrink-0" />
                                                ) : (
                                                    <Pin className="h-5 w-5 text-red-500 flex-shrink-0" />
                                                )}
                                                <div className="flex-grow text-left">
                                                    <p className="font-medium">{preference.city.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {preference.isPetition
                                                            ? 'Ζητήσατε την συμμετοχή του δήμου'
                                                            : `${preference.locations?.length || 0} τοποθεσίες, ${preference.topics?.length || 0} θέματα`
                                                        }
                                                    </p>
                                                </div>
                                                <Settings className="h-4 w-4 text-gray-400" />
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );

            case SignupStage.LOCATION_TOPIC_SELECTION:
                if (!selectedCity) return null;
                return (
                    <div className="flex flex-col gap-6 w-full max-w-md">
                        <LocationSelector
                            selectedLocations={selectedLocations}
                            onSelect={handleLocationSelect}
                            onRemove={handleLocationRemove}
                            city={selectedCity}
                        />
                        <TopicSelector
                            selectedTopics={selectedTopics}
                            onSelect={handleTopicSelect}
                            onRemove={handleTopicRemove}
                        />
                        <button
                            onClick={handleContinueToRegistration}
                            className="px-4 py-2 bg-primary text-white rounded-md mt-4"
                        >
                            Συνέχεια
                        </button>
                    </div>
                );

            case SignupStage.UNSUPPORTED_MUNICIPALITY:
                if (!selectedCity) return null;
                return (
                    <UnsupportedMunicipality
                        city={selectedCity}
                        onSubmit={handlePetitionSubmit}
                        initialData={petitionData || undefined}
                    />
                );

            case SignupStage.USER_REGISTRATION:
                // Skip user registration if already authenticated
                if (sessionStatus === 'authenticated' && session?.user) {
                    // Submit automatically with the existing user information
                    if (!isUpdating) {
                        handleUserRegistration(session.user.email || '');
                    }

                    return (
                        <div className="w-full max-w-md text-center p-4">
                            <h2 className="text-xl font-bold mb-4">Υποβολή στοιχείων</h2>
                            <div className="animate-pulse flex flex-col items-center mt-4">
                                <div className="h-10 w-10 bg-primary/20 rounded-full mb-4"></div>
                                <p>Επεξεργασία των επιλογών σας...</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <>
                        {/* Email exists error message */}
                        {emailExistsError && (
                            <div className="w-full max-w-md mb-4 p-4 border border-red-300 bg-red-50 rounded-md">
                                <p className="text-red-700 mb-2">
                                    Ο λογαριασμός με email <strong>{emailExistsError}</strong> υπάρχει ήδη.
                                </p>
                                <p className="text-red-700 mb-4">
                                    Παρακαλώ συνδεθείτε πρώτα για να συνεχίσετε.
                                </p>
                                <Button
                                    onClick={() => handleSignIn(emailExistsError)}
                                    className="w-full"
                                >
                                    Σύνδεση
                                </Button>
                            </div>
                        )}

                        <UserRegistration
                            city={selectedCity}
                            petitionData={petitionData}
                            locations={selectedLocations}
                            topics={selectedTopics}
                            onSubmit={handleUserRegistration}
                            emailError={!!emailExistsError}
                        />
                    </>
                );

            case SignupStage.COMPLETE:
                return (
                    <div className="text-center p-6 max-w-md">
                        <h2 className="text-2xl font-bold mb-4">Ευχαριστούμε!</h2>
                        <p className="mb-4">
                            {sessionStatus === 'authenticated'
                                ? 'Οι επιλογές σας ενημερώθηκαν με επιτυχία.'
                                : 'Η εγγραφή σας ολοκληρώθηκε. Έχουμε στείλει ένα email για την επιβεβαίωση του λογαριασμού σας.'
                            }
                        </p>

                        <div className="flex flex-col gap-2 mt-6">
                            <Button
                                variant="default"
                                className="w-full"
                                onClick={() => router.push('/')}
                            >
                                Επιστροφή στην αρχική
                            </Button>

                            {sessionStatus === 'authenticated' && (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleReset}
                                >
                                    Διαχείριση άλλης εγγραφής
                                </Button>
                            )}
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="relative h-screen w-full overflow-hidden">
            {/* Map background - always visible */}
            <div className={cn(
                "absolute inset-0 w-full h-full transition-opacity duration-300",
                !isDesktop && !showMap && "opacity-30" // Dim map on mobile when form is focused
            )}>
                <Map
                    features={mapFeatures}
                    center={mapCenter}
                    zoom={mapZoom}
                    animateRotation={false}
                    pitch={0}
                    key={`map-${mapCenter[0]}-${mapCenter[1]}-${mapZoom}`}
                />
            </div>

            {/* Header */}
            <SignupHeader
                city={selectedCity}
                stage={stage}
                onBack={handleBack}
            />

            {/* Content overlay with form elements */}
            {showForm && (
                <div
                    className={cn(
                        "absolute z-10 transition-all duration-300 ease-in-out",
                        isDesktop
                            ? "left-0 top-16 bottom-0 w-1/3 bg-white/95 backdrop-blur-sm shadow-xl" // Desktop: Left sidebar, adjusted top for new header
                            : "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] max-h-[60vh] max-w-md rounded-xl shadow-2xl overflow-hidden", // Mobile: Centered box with height limit
                        !isDesktop && "bg-white/95 backdrop-blur-sm"
                    )}
                >
                    <div className={cn(
                        "w-full overflow-y-auto",
                        isDesktop ? "h-full p-6" : "max-h-[60vh] p-6 md:p-8", // More padding on tablet, scrollable container
                        !isDesktop && "space-y-6" // Add more spacing between elements on mobile
                    )}>
                        {isLoading ? (
                            <div className="w-full h-40 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                            </div>
                        ) : (
                            renderFormContent()
                        )}
                    </div>
                </div>
            )}

            {/* Toggle buttons for mobile view - bottom right corner */}
            {!isDesktop && (
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
                    {/* Toggle form visibility */}
                    <Button
                        variant="default"
                        size="icon"
                        className="rounded-full shadow-lg"
                        onClick={toggleForm}
                    >
                        {showForm ? <EyeOff size={20} /> : <Eye size={20} />}
                    </Button>

                    {/* Toggle map visibility (only when form is shown) */}
                    {showForm && (
                        <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full shadow-lg bg-white/80"
                            onClick={() => setShowMap(prev => !prev)}
                        >
                            <MapIcon size={20} className={showMap ? "text-primary" : "text-gray-400"} />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
} 