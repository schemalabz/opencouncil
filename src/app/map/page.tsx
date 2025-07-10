"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Map from "@/components/map/map";
import { MapFeature } from '@/components/map/map';
import { getMunicipalitiesForMap, getSubjectsForMap } from '@/lib/map-data';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';
import type { Feature } from 'geojson';
import { getAllCitiesMinimal } from '@/lib/db/cities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type MapMode = 'municipalities' | 'subjects';

// Note: This page is hardcoded to Greek as requested.
// The button labels are in Greek.
export default function CentralMapPage() {
    const router = useRouter();
    const [mode, setMode] = useState<MapMode>('municipalities');
    const [features, setFeatures] = useState<MapFeature[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [cities, setCities] = useState<Awaited<ReturnType<typeof getAllCitiesMinimal>>>([]);
    const [selectedCity, setSelectedCity] = useState<string | null>(null);

    useEffect(() => {
        async function fetchCities() {
            const cityList = await getAllCitiesMinimal();
            setCities(cityList);
        }
        fetchCities();
    }, []);

    useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            try {
                if (mode === 'municipalities') {
                    const municipalityFeatures = await getMunicipalitiesForMap(selectedCity);
                    // Filter out features with no geometry to prevent map errors
                    const validFeatures = municipalityFeatures.filter((f: MapFeature) => f.geometry);
                    setFeatures(validFeatures);
                } else {
                    // For subjects, we'll temporarily hardcode Chania to ensure data is visible.
                    const subjectFeatures = await getSubjectsForMap('chania');
                    setFeatures(subjectFeatures);
                    console.log('[CentralMapPage] Client-side features for map:', subjectFeatures);
                }
            } catch (error) {
                console.error("Failed to fetch map data:", error);
                // TODO: Add user-facing error state
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, [mode, selectedCity]);

    const handleFeatureClick = (feature: Feature) => {
        console.log('[CentralMapPage] Clicked feature:', feature); // Log the entire feature object
        if (feature.properties?.subjectId && feature.properties?.cityId && feature.properties?.councilMeetingId) {
            // Navigate to subject page
            const { cityId, councilMeetingId, subjectId } = feature.properties;
            router.push(`/el/${cityId}/${councilMeetingId}/subjects/${subjectId}`);

        } else {
            console.error("Navigation failed because some properties were missing.");
            console.log("Available properties:", feature.properties);
        }
    };

    return (
        <div className="absolute inset-0">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-background/80 backdrop-blur-sm rounded-lg shadow-lg flex gap-2 items-center">
                <Button 
                    onClick={() => setMode('municipalities')}
                    variant={mode === 'municipalities' ? 'default' : 'outline'}
                >
                    Δήμοι
                </Button>
                <Button 
                    onClick={() => setMode('subjects')}
                    variant={mode === 'subjects' ? 'default' : 'outline'}
                >
                    Θέματα
                </Button>

                <Select onValueChange={(value) => setSelectedCity(value === 'all' ? null : value)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Όλοι οι Δήμοι" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Όλοι οι Δήμοι</SelectItem>
                        {cities.map(city => (
                            <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            {isLoading && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-20">
                    <Loader className="animate-spin h-10 w-10 text-primary" />
                </div>
            )}

            <Map
                className="w-full h-full"
                features={features}
                center={[25.0, 39.0]} // Center on Greece
                zoom={6} // Zoom to show the whole country
                animateRotation={false}
                onFeatureClick={handleFeatureClick}
            />
        </div>
    );
} 