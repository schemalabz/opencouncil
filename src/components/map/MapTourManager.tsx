"use client"
import { useEffect } from 'react';
import { useMapTour } from "@/hooks/useMapTour";
import { useMapAnimation } from "@/hooks/useMapAnimation";
import { Play, Pause, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapFeature } from "./map";

interface MapTourManagerProps {
    features: MapFeature[];
    selectedCities: string[];
    allCities: { id: string, name: string }[];
    isUIBlocked: boolean; // if sheets or explainer are open
    onUpdateMap: (tourFeature: GeoJSON.Feature | null, travelerGeoJSON: GeoJSON.FeatureCollection | null, isPaused: boolean) => void;
}

/**
 * SOTA Tour Manager
 * Encapsulates all tour state and coordination.
 */
export function MapTourManager({ 
    features, 
    selectedCities, 
    allCities, 
    isUIBlocked,
    onUpdateMap 
}: MapTourManagerProps) {
    
    const { 
        activeFeature: rawTourFeature, 
        isActive: isTourActive, 
        isPaused: isTourPaused, 
        setIsPaused: setIsTourPaused,
        cityName: tourCityName,
        activeIndex: tourIndex,
        tourSubjects,
        stopTour
    } = useMapTour({
        features,
        selectedCities,
        allCities,
        isEnabled: !isUIBlocked
    });

    const { delayedTourFeature, travelerGeoJSON } = useMapAnimation(rawTourFeature);

    // Sync with Parent Map
    useEffect(() => {
        onUpdateMap(delayedTourFeature, travelerGeoJSON, isTourPaused);
    }, [delayedTourFeature, travelerGeoJSON, isTourPaused, onUpdateMap]);

    if (!isTourActive) return null;

    return (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto scale-90 sm:scale-100 transition-all duration-300">
            <div className="bg-black/75 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
                <div className="flex items-center gap-2">
                    <div className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap opacity-90">
                        ΠΕΡΙΗΓΗΣΗ: {tourCityName}
                    </span>
                </div>
                
                <div className="h-3 w-px bg-white/20" />
                
                <div className="flex items-center gap-1 text-[9px] font-medium text-white/60">
                    <span>{tourIndex + 1}/{tourSubjects.length}</span>
                </div>

                <div className="flex items-center gap-0.5">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-white/10 cursor-pointer pointer-events-auto"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsTourPaused(!isTourPaused);
                        }}
                    >
                        {isTourPaused ? <Play className="h-2.5 w-2.5 fill-current text-white" /> : <Pause className="h-2.5 w-2.5 fill-current text-white" />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-white/10 text-red-400/80 hover:text-red-300 cursor-pointer pointer-events-auto"
                        onClick={(e) => {
                            e.stopPropagation();
                            stopTour();
                        }}
                    >
                        <XCircle className="h-2.5 w-2.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
