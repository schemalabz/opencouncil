'use client';

import { useState, useEffect } from 'react';
import Map, { MapFeature } from '@/components/map/map';
import { SignupHeader } from './SignupHeader';
import { MunicipalitySelector } from './MunicipalitySelector';
import { LocationSelector } from './LocationSelector';
import { TopicSelector } from './TopicSelector';
import { UserRegistration } from './UserRegistration';
import { UnsupportedMunicipality } from './UnsupportedMunicipality';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

// Define types that match the Prisma schema
type City = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    name_municipality_en: string;
    logoImage: string | null;
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
    officialSupport: boolean;
    isListed?: boolean;
    isPending?: boolean;
    authorityType?: string;
    wikipediaId?: string | null;
    geometry?: any;
    supportsNotifications: boolean;
};

type Location = {
    id: string;
    text: string;
    coordinates: [number, number];
};

type Topic = {
    id: string;
    name: string;
    name_en: string;
    colorHex: string;
    icon?: string;
    createdAt?: Date;
    updatedAt?: Date;
};

// Define signup stages
enum SignupStage {
    SELECT_MUNICIPALITY = 0,
    LOCATION_TOPIC_SELECTION = 1,
    UNSUPPORTED_MUNICIPALITY = 2,
    USER_REGISTRATION = 3,
    COMPLETE = 4,
}

// Define petition data type
type PetitionData = {
    name: string;
    isResident: boolean;
    isCitizen: boolean;
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
    const { data: session } = useSession();
    const router = useRouter();
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    // State variables
    const [stage, setStage] = useState<SignupStage>(SignupStage.SELECT_MUNICIPALITY);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
    const [petitionData, setPetitionData] = useState<PetitionData | null>(null);
    const [mapFeatures, setMapFeatures] = useState<MapFeature[]>([]);
    const [mapCenter, setMapCenter] = useState<[number, number]>([23.7275, 37.9838]); // Default to Athens
    const [mapZoom, setMapZoom] = useState<number>(6);
    const [showForm, setShowForm] = useState(true);

    // When city is selected, update map features and center
    useEffect(() => {
        if (selectedCity?.geometry) {
            // Calculate center and zoom based on city geometry
            const { center, zoom } = calculateMapView(selectedCity.geometry);

            // Update map center and zoom
            setMapCenter(center);
            setMapZoom(zoom);

            // Log for debugging
            console.log(`Setting map view: center=${center}, zoom=${zoom}`);

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

            const locationFeatures = selectedLocations.map(location => ({
                id: location.id,
                geometry: {
                    type: 'Point',
                    coordinates: location.coordinates
                },
                style: {
                    fillColor: '#EF4444',
                    fillOpacity: 0.8,
                    strokeColor: '#B91C1C',
                    strokeWidth: 6
                }
            }));

            setMapFeatures([cityFeature, ...locationFeatures]);
        }
    }, [selectedCity, selectedLocations]);

    // Initialize showForm based on screen size
    useEffect(() => {
        setShowForm(true);
    }, []);

    // Handler for municipality selection
    const handleMunicipalitySelect = (city: City) => {
        console.log('Selected city geometry:', city.geometry);
        setSelectedCity(city);

        // Route to appropriate next stage based on city support
        if (city.supportsNotifications) {
            setStage(SignupStage.LOCATION_TOPIC_SELECTION);
        } else {
            setStage(SignupStage.UNSUPPORTED_MUNICIPALITY);
        }
    };

    // Handler for location selection
    const handleLocationSelect = (location: Location) => {
        setSelectedLocations(prev => [...prev, location]);
    };

    // Handler for location removal
    const handleLocationRemove = (locationId: string) => {
        setSelectedLocations(prev => prev.filter(loc => loc.id !== locationId));
    };

    // Handler for topic selection
    const handleTopicSelect = (topic: Topic) => {
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
            let response;

            // If we have petition data, submit a petition
            if (petitionData && selectedCity) {
                response = await fetch('/api/petitions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        cityId: selectedCity.id,
                        name: petitionData.name,
                        isResident: petitionData.isResident,
                        isCitizen: petitionData.isCitizen,
                        email,
                        phone
                    })
                });
            }
            // Otherwise, submit notification preferences
            else if (selectedCity) {
                response = await fetch('/api/notifications/preferences', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        cityId: selectedCity.id,
                        name,
                        locations: selectedLocations.map(loc => loc.id),
                        topics: selectedTopics.map(topic => topic.id),
                        email,
                        phone
                    })
                });
            } else {
                throw new Error('No city selected');
            }

            if (response && response.ok) {
                // Move to completion stage
                setStage(SignupStage.COMPLETE);
            } else {
                // Handle errors
                console.error('Failed to submit data');
            }
        } catch (error) {
            console.error('Error submitting data:', error);
        }
    };

    // Handle back button
    const handleBack = () => {
        if (stage === SignupStage.LOCATION_TOPIC_SELECTION || stage === SignupStage.UNSUPPORTED_MUNICIPALITY) {
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

    // Determine whether this is for a petition or notification preferences
    const isPetition = petitionData !== null && petitionData !== undefined;

    // Render the appropriate form content based on the current stage
    const renderFormContent = () => {
        switch (stage) {
            case SignupStage.SELECT_MUNICIPALITY:
                return <MunicipalitySelector onSelect={handleMunicipalitySelect} />;

            case SignupStage.LOCATION_TOPIC_SELECTION:
                if (!selectedCity) return null;
                return (
                    <div className="flex flex-col gap-6 w-full max-w-md">
                        <LocationSelector
                            selectedLocations={selectedLocations}
                            onSelect={handleLocationSelect}
                            onRemove={handleLocationRemove}
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
                    />
                );

            case SignupStage.USER_REGISTRATION:
                return (
                    <UserRegistration
                        city={selectedCity}
                        petitionData={petitionData}
                        locations={selectedLocations}
                        topics={selectedTopics}
                        onSubmit={handleUserRegistration}
                    />
                );

            case SignupStage.COMPLETE:
                return (
                    <div className="text-center p-6 max-w-md">
                        <h2 className="text-2xl font-bold mb-4">Ευχαριστούμε!</h2>
                        <p className="mb-4">Η εγγραφή σας ολοκληρώθηκε με επιτυχία.</p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 bg-primary text-white rounded-md"
                        >
                            Επιστροφή στην αρχική
                        </button>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="relative h-screen w-full overflow-hidden">
            {/* Map background - always visible */}
            <div className="absolute inset-0 w-full h-full">
                <Map
                    features={mapFeatures}
                    center={mapCenter}
                    zoom={mapZoom}
                    animateRotation={false}
                    pitch={0}
                    key={`map-${mapCenter[0]}-${mapCenter[1]}-${mapZoom}`}
                />
            </div>

            {/* Header - always spans full width */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-black/10 backdrop-blur-md">
                <SignupHeader
                    city={selectedCity}
                    stage={stage}
                    onBack={handleBack}
                />
            </div>

            {/* Content overlay with form elements */}
            {showForm && (
                <div
                    className={cn(
                        "absolute z-10 transition-all duration-300 ease-in-out",
                        isDesktop
                            ? "left-0 top-[65px] bottom-0 w-1/3 p-6 bg-white/90 backdrop-blur-sm shadow-xl" // Desktop: Left sidebar
                            : "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl p-8" // Mobile: Centered box with improved padding
                    )}
                >
                    <div className={cn(
                        "h-auto w-full overflow-y-auto",
                        !isDesktop && "space-y-6" // Add more spacing between elements on mobile
                    )}>
                        {renderFormContent()}
                    </div>
                </div>
            )}

            {/* Toggle button for mobile view - bottom right corner */}
            {!isDesktop && (
                <Button
                    variant="default"
                    size="icon"
                    className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
                    onClick={toggleForm}
                >
                    {showForm ? <EyeOff size={20} /> : <Eye size={20} />}
                </Button>
            )}
        </div>
    );
} 