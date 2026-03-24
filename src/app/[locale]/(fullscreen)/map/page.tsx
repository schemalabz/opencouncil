"use client"
import { useState, useCallback, useEffect } from "react";
import Map from "@/components/map/map";
import { MapFilters } from "@/components/map/MapFilters";
import { CitySheet } from "@/components/map/CitySheet";
import { SubjectInfoSheet } from "@/components/map/SubjectInfoSheet";
import { MapExplainer } from "@/components/map/MapExplainer";
import { MapLegend } from "@/components/map/MapLegend";
import { MapPopup } from "@/components/map/MapPopup";
import { MapFiltersState } from "@/types/map";
import { useMapOptions } from "@/hooks/useMapOptions";
import { useMapPersonalization } from "@/hooks/useMapPersonalization";
import { useMapFeatures } from "@/hooks/useMapFeatures";
import { useMapZoom } from "@/hooks/useMapZoom";
import { useMapSheets } from "@/hooks/useMapSheets";
import { useFirstVisit } from "@/hooks/useFirstVisit";
import { MapTourGate } from "@/components/map/MapTourGate";

export default function MapPage() {
    // Custom hooks
    const { allTopics, allCities, citiesWithGeometry, isLoading } = useMapOptions();

    // State - initialized with empty lists, then populated when allTopics/allCities load
    const [filters, setFilters] = useState<MapFiltersState>({
        monthsBack: 6,
        selectedTopics: [],
        selectedCities: [],
        selectedBodyTypes: ['council', 'committee', 'community'],
        longOnly: false
    });

    const [filtersInitialized, setFiltersInitialized] = useState(false);

    const { zoomToGeometry, setZoomToGeometry } = useMapZoom(
        filters.selectedCities,
        citiesWithGeometry
    );

    const { features, isUpdating, error } = useMapFeatures({
        filters,
        allTopicsLoaded: allTopics.length > 0,
        allCitiesLoaded: allCities.length > 0,
        filtersInitialized,
        // onCitiesUpdate is optional - useMapZoom already tracks cities via citiesWithGeometry prop
        onCitiesUpdate: undefined
    });

    const {
        citySheet,
        setCitySheet,
        subjectSheet,
        setSubjectSheet,
        openCitySheet,
        openSubjectSheet
    } = useMapSheets();

    const { showExplainer, setShowExplainer } = useFirstVisit('opencouncil-map-explainer-dismissed');

    // Tour State (managed via Gate)
    const [activeTourFeature, setActiveTourFeature] = useState<GeoJSON.Feature | null>(null);
    const [travelerGeoJSON, setTravelerGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
    const [isTourPaused, setIsTourPaused] = useState(false);

    // Apply user personalization
    useMapPersonalization({
        allTopics,
        allCities: allCities.map(c => c.id),
        citiesWithGeometry,
        onFiltersChange: (newFilters) => {
            setFilters(newFilters);
            setFiltersInitialized(true);
        },
        onZoomChange: setZoomToGeometry
    });

    // Handlers
    const handleFeatureClick = (feature: GeoJSON.Feature) => {
        const featureType = feature.properties?.featureType;

        if (featureType === 'subject') {
            openSubjectSheet({
                subjectId: feature.properties?.subjectId || '',
                subjectName: feature.properties?.name || '',
                cityId: feature.properties?.cityId || '',
                councilMeetingId: feature.properties?.councilMeetingId || '',
                description: feature.properties?.description,
                locationText: feature.properties?.locationText,
                topicName: feature.properties?.topicName,
                topicColor: feature.properties?.topicColor,
                topicIcon: feature.properties?.topicIcon,
                meetingDate: feature.properties?.meetingDate,
                meetingName: feature.properties?.meetingName,
                discussionTimeSeconds: feature.properties?.discussionTimeSeconds,
                speakerCount: feature.properties?.speakerCount,
                cityName: feature.properties?.cityName
            });
        } else if (featureType === 'city') {
            openCitySheet({
                cityId: feature.properties?.cityId || '',
                cityName: feature.properties?.name || '',
                logoImage: feature.properties?.logoImage,
                meetingsCount: feature.properties?.meetingsCount || 0,
                officialSupport: feature.properties?.officialSupport || false,
                supportsNotifications: feature.properties?.supportsNotifications || false
            });
        }
    };

    const renderPopup = (feature: GeoJSON.Feature) => {
        return <MapPopup feature={feature} />;
    };

    return (
        <div className="h-screen w-full relative">
            <Map
                features={features}
                animateRotation={false}
                center={[23.7275, 37.9838]}
                zoom={7}
                pitch={0}
                renderPopup={renderPopup}
                onFeatureClick={handleFeatureClick}
                className="h-full w-full"
                zoomToGeometry={zoomToGeometry}
                activeTourFeature={activeTourFeature}
                travelerGeoJSON={travelerGeoJSON}
                onTourPause={setIsTourPaused}
            />

            {/* SOTA Feature Gate */}
            <MapTourGate
                features={features}
                selectedCities={filters.selectedCities}
                allCities={allCities}
                isUIBlocked={citySheet.open || subjectSheet.open || showExplainer}
                onUpdateMap={(feature, traveler, paused) => {
                    setActiveTourFeature(feature);
                    setTravelerGeoJSON(traveler);
                    setIsTourPaused(paused);
                }}
            />

            {/* Loading overlay */}
            {isUpdating && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className="flex items-center gap-3 text-white bg-black/80 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                        <span className="text-lg font-medium">Ενημέρωση χάρτη...</span>
                    </div>
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className="flex items-center gap-3 text-white bg-red-600/90 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-lg font-medium">{error}</span>
                    </div>
                </div>
            )}

            {/* UI Controls */}
            {!isLoading && allTopics.length > 0 && allCities.length > 0 && (
                <>
                    <MapFilters
                        filters={filters}
                        allTopics={allTopics}
                        allCities={allCities}
                        onFiltersChange={setFilters}
                    />
                    <MapLegend onShowExplainer={() => setShowExplainer(true)} />
                    <MapExplainer
                        open={showExplainer}
                        onOpenChange={setShowExplainer}
                        hideButton={false}
                    />

                    {/* Map Summary */}
                    <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden sm:block">
                        <div className="text-white bg-black/70 backdrop-blur-sm px-3 py-2 rounded-full text-xs font-medium">
                            <div className="flex items-center gap-2">
                                <span>
                                    {features.filter(f => f.properties?.featureType === 'subject').length} θέματα
                                </span>
                                <span className="text-white/60">•</span>
                                <span className={filters.selectedTopics.length === 0 ? "text-red-400" : ""}>
                                    {filters.selectedTopics.length === 0
                                        ? `καμία θεματική`
                                        : filters.selectedTopics.length === 1
                                            ? filters.selectedTopics[0].name
                                            : filters.selectedTopics.length === allTopics.length
                                                ? `όλες οι θεματικές`
                                                : `${filters.selectedTopics.length}/${allTopics.length} θεματικές`
                                    }
                                </span>
                                <span className="text-white/60">•</span>
                                <span>
                                    {filters.monthsBack === 1
                                        ? `1 μήνας`
                                        : `${filters.monthsBack} μήνες`
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Sheets */}
            <CitySheet
                open={citySheet.open}
                onOpenChange={(open) => setCitySheet(prev => ({ ...prev, open }))}
                cityId={citySheet.cityId}
                cityName={citySheet.cityName}
                logoImage={citySheet.logoImage}
                meetingsCount={citySheet.meetingsCount}
                officialSupport={citySheet.officialSupport}
                supportsNotifications={citySheet.supportsNotifications}
            />

            <SubjectInfoSheet
                open={subjectSheet.open}
                onOpenChange={(open) => setSubjectSheet(prev => ({ ...prev, open }))}
                subjectId={subjectSheet.subjectId}
                subjectName={subjectSheet.subjectName}
                cityId={subjectSheet.cityId}
                councilMeetingId={subjectSheet.councilMeetingId}
                description={subjectSheet.description}
                locationText={subjectSheet.locationText}
                topicName={subjectSheet.topicName}
                topicColor={subjectSheet.topicColor}
                topicIcon={subjectSheet.topicIcon}
                meetingDate={subjectSheet.meetingDate}
                meetingName={subjectSheet.meetingName}
                discussionTimeSeconds={subjectSheet.discussionTimeSeconds}
                speakerCount={subjectSheet.speakerCount}
                cityName={subjectSheet.cityName}
            />
        </div>
    );
}
