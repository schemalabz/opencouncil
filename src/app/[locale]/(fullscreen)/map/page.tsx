"use client"
import Map, { MapFeature } from "@/components/map/map";
import { CityWithGeometry } from "@/lib/db/cities";
import { useEffect, useState } from "react";
import Icon from "@/components/icon";
import { icons } from 'lucide-react';
import { MapFilters, MapFiltersState } from "@/components/map/MapFilters";
import { CitySheet } from "@/components/map/CitySheet";
import { SubjectInfoSheet } from "@/components/map/SubjectInfoSheet";
import { MapExplainer } from "@/components/map/MapExplainer";
import { Topic } from '@prisma/client';

interface SubjectWithGeometry {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    locationText: string;
    locationType: string;
    topicName: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
}

export default function MapPage() {
    const [features, setFeatures] = useState<MapFeature[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [allTopics, setAllTopics] = useState<Topic[]>([]);
    const [filters, setFilters] = useState<MapFiltersState>({
        monthsBack: 6,
        selectedTopics: []
    });
    const [citySheet, setCitySheet] = useState<{
        open: boolean;
        cityId: string;
        cityName: string;
        logoImage?: string;
        meetingsCount: number;
        officialSupport: boolean;
        supportsNotifications: boolean;
    }>({
        open: false,
        cityId: '',
        cityName: '',
        meetingsCount: 0,
        officialSupport: false,
        supportsNotifications: false
    });

    const [subjectSheet, setSubjectSheet] = useState<{
        open: boolean;
        subjectId: string;
        subjectName: string;
        cityId: string;
        councilMeetingId: string;
        // Additional metadata
        description?: string;
        locationText?: string;
        topicName?: string;
        topicColor?: string;
        topicIcon?: string | null;
        meetingDate?: string;
        meetingName?: string;
        discussionTimeSeconds?: number;
        speakerCount?: number;
        cityName?: string;
    }>({
        open: false,
        subjectId: '',
        subjectName: '',
        cityId: '',
        councilMeetingId: ''
    });

    // Fetch all topics on mount
    useEffect(() => {
        async function loadTopics() {
            try {
                const response = await fetch('/api/topics');
                const topics: Topic[] = await response.json();
                setAllTopics(topics);
                // Initialize with all topics selected
                setFilters(prev => ({ ...prev, selectedTopics: topics }));
            } catch (error) {
                console.error('Error loading topics:', error);
            }
        }
        loadTopics();
    }, []);

    // Fetch subjects based on filters
    useEffect(() => {
        console.log('🔄 useEffect triggered with filters:', {
            monthsBack: filters.monthsBack,
            selectedTopicsCount: filters.selectedTopics.length,
            allTopicsCount: allTopics.length
        });

        // Don't fetch until topics are loaded
        if (allTopics.length === 0) {
            console.log('⏸️ Skipping fetch - topics not loaded yet');
            return;
        }

        // Create an AbortController for this request
        const abortController = new AbortController();
        let isStale = false;

        async function loadCities() {
            try {
                setIsUpdating(true);

                // Build query params for subjects
                const topicIds = filters.selectedTopics.map(t => t.id).join(',');
                const subjectsUrl = `/api/map/subjects?monthsBack=${filters.monthsBack}${topicIds ? `&topicIds=${topicIds}` : ''}`;

                console.log('🌐 Frontend: Fetching with filters:', {
                    monthsBack: filters.monthsBack,
                    selectedTopicsCount: filters.selectedTopics.length,
                    topicIds,
                    url: subjectsUrl
                });

                // Fetch both cities and subjects in parallel (with abort signal)
                const [citiesResponse, subjectsResponse] = await Promise.all([
                    fetch('/api/cities/map', {
                        cache: 'no-store',
                        signal: abortController.signal
                    }),
                    fetch(subjectsUrl, {
                        cache: 'no-store',
                        signal: abortController.signal
                    })
                ]);

                // Check if this request was cancelled
                if (isStale) {
                    console.log('🚫 Request cancelled - newer request in progress');
                    return;
                }

                const cities: CityWithGeometry[] = await citiesResponse.json();
                const subjects: SubjectWithGeometry[] = await subjectsResponse.json();

                console.log('📦 Frontend: Received', subjects.length, 'subjects');
                console.log('📊 Frontend: Sample subjects:', subjects.slice(0, 3).map(s => ({
                    name: s.name,
                    date: s.meetingDate,
                    topic: s.topicName
                })));

                // Convert ALL cities with geometry to map features
                // Show both supported and unsupported municipalities
                const citiesWithGeometry = cities.filter(city => city.geometry);
                const supportedWithGeometry = citiesWithGeometry.filter(city => city.officialSupport);
                const unsupportedWithGeometry = citiesWithGeometry.filter(city => !city.officialSupport);

                // Convert cities to map features
                const cityFeatures: MapFeature[] = citiesWithGeometry.map(city => ({
                    id: city.id,
                    geometry: city.geometry!,
                    properties: {
                        name: city.name,
                        name_en: city.name_en,
                        cityId: city.id,
                        officialSupport: city.officialSupport,
                        supportsNotifications: city.supportsNotifications,
                        logoImage: (city as any).logoImage,
                        meetingsCount: (city as any)._count?.councilMeetings || 0,
                        featureType: 'city'
                    },
                    style: {
                        fillColor: city.officialSupport ? '#000000' : 'hsl(212, 50%, 76%)', // Black for supported (won't show), Blue for unsupported
                        fillOpacity: 0, // NO fill by default for BOTH
                        strokeColor: city.officialSupport ? 'hsl(24, 100%, 50%)' : 'hsl(212, 50%, 76%)', // Orange for supported, Blue for unsupported
                        strokeWidth: city.officialSupport ? 1.5 : 0, // Supported: border visible, Unsupported: no border
                        strokeOpacity: city.officialSupport ? 0.6 : 0, // Supported: visible, Unsupported: invisible
                    }
                }));

                // Calculate opacity based on recency
                const now = new Date();
                const periodInMs = filters.monthsBack * 30.44 * 24 * 60 * 60 * 1000; // Average month in milliseconds
                const oldestDate = new Date(now.getTime() - periodInMs);

                // Convert subjects to point features with opacity based on recency
                const subjectFeatures: MapFeature[] = subjects.map(subject => {
                    // Find the corresponding city name for this subject
                    const correspondingCity = citiesWithGeometry.find(city => city.id === subject.cityId);
                    // Calculate opacity: 0.2 (20%) for oldest, 1.0 (100%) for newest
                    let opacity = 0.85; // default
                    if (subject.meetingDate) {
                        const meetingDate = new Date(subject.meetingDate);
                        const ageInMs = now.getTime() - meetingDate.getTime();
                        const ageRatio = ageInMs / periodInMs; // 0 = newest, 1 = oldest
                        // Linear interpolation: newest (0) -> 1.0, oldest (1) -> 0.2
                        opacity = Math.max(0.2, Math.min(1.0, 1.0 - (ageRatio * 0.8)));
                    }

                    return {
                        id: `subject-${subject.id}`,
                        geometry: subject.geometry,
                        properties: {
                            name: subject.name,
                            description: subject.description,
                            subjectId: subject.id,
                            cityId: subject.cityId,
                            cityName: correspondingCity?.name, // Add city name directly to subject properties
                            councilMeetingId: subject.councilMeetingId,
                            locationText: subject.locationText,
                            topicName: subject.topicName,
                            topicColor: subject.topicColor,
                            topicIcon: subject.topicIcon,
                            meetingDate: subject.meetingDate,
                            meetingName: subject.meetingName,
                            discussionTimeSeconds: subject.discussionTimeSeconds,
                            speakerCount: subject.speakerCount,
                            featureType: 'subject'
                        },
                        style: {
                            fillColor: subject.topicColor,
                            fillOpacity: opacity,
                            strokeColor: subject.topicColor, // Same color as fill, no white border
                            strokeWidth: 4, // Smaller dots
                            strokeOpacity: 0, // No stroke
                        }
                    };
                });

                // Combine city boundaries and subject points
                setFeatures([...cityFeatures, ...subjectFeatures]);
            } catch (error) {
                // Don't log error if request was aborted
                if (error instanceof Error && error.name === 'AbortError') {
                    console.log('🚫 Request aborted');
                } else {
                    console.error('Error loading cities:', error);
                }
            } finally {
                if (!isStale) {
                    setIsUpdating(false);
                }
            }
        }

        loadCities();

        // Cleanup function: abort the request if a new one starts
        return () => {
            console.log('🧹 Cleanup: aborting previous request');
            isStale = true;
            abortController.abort();
        };
    }, [filters, allTopics.length]);

    const renderPopup = (feature: GeoJSON.Feature) => {
        const featureType = feature.properties?.featureType;

        // Subject popup
        if (featureType === 'subject') {
            const name = feature.properties?.name;
            const description = feature.properties?.description;
            const locationText = feature.properties?.locationText;
            const topicName = feature.properties?.topicName;
            const topicColor = feature.properties?.topicColor;
            const topicIcon = feature.properties?.topicIcon;
            const meetingDate = feature.properties?.meetingDate;
            const meetingName = feature.properties?.meetingName;
            const discussionTimeSeconds = feature.properties?.discussionTimeSeconds;
            const speakerCount = feature.properties?.speakerCount;
            const cityName = feature.properties?.cityName;

            // Format meeting date
            const formattedDate = meetingDate ? new Date(meetingDate).toLocaleDateString('el-GR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : null;

            // Format discussion time
            const formattedTime = discussionTimeSeconds ? (() => {
                const minutes = Math.floor(discussionTimeSeconds / 60);
                if (minutes < 60) return `${minutes} λεπτά`;
                const hours = Math.floor(minutes / 60);
                const remainingMinutes = minutes % 60;
                return remainingMinutes > 0 ? `${hours}ω ${remainingMinutes}λ` : `${hours} ώρα${hours > 1 ? 'ες' : ''}`;
            })() : null;

            return (
                <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 max-w-sm">
                    <div className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div
                                className="p-3 rounded-lg flex-shrink-0 shadow-sm flex items-center justify-center min-h-[80px] w-[60px]"
                                style={{ backgroundColor: topicColor ? topicColor + "15" : "#f3f4f6" }}
                            >
                                {topicIcon && (topicIcon in icons) ? (
                                    <Icon
                                        name={topicIcon as keyof typeof icons}
                                        color={topicColor || "#6b7280"}
                                        size={24}
                                    />
                                ) : (
                                    <div
                                        className="w-6 h-6 rounded-full"
                                        style={{ backgroundColor: topicColor }}
                                    />
                                )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                    {topicName && (
                                        <span
                                            className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                                            style={{ backgroundColor: topicColor }}
                                        >
                                            {topicName}
                                        </span>
                                    )}
                                </div>
                                <h4 className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{name}</h4>
                                {(cityName || locationText) && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                        {cityName && (
                                            <>
                                                <Icon name="Building2" size={10} color="#9ca3af" />
                                                <span>{cityName}</span>
                                            </>
                                        )}
                                        {cityName && locationText && (
                                            <span className="mx-1">•</span>
                                        )}
                                        {locationText && (
                                            <>
                                                <Icon name="MapPin" size={10} color="#9ca3af" />
                                                <span>{locationText}</span>
                                            </>
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {formattedDate && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Icon name="Calendar" size={12} color="#9ca3af" />
                                    <span className="line-clamp-1">{formattedDate}</span>
                                </div>
                            )}

                            {formattedTime && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Icon name="Clock" size={12} color="#9ca3af" />
                                    <span>{formattedTime}</span>
                                </div>
                            )}

                            {speakerCount !== undefined && speakerCount > 0 && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Icon name="Users" size={12} color="#9ca3af" />
                                    <span>{speakerCount} {speakerCount === 1 ? 'ομιλητής' : 'ομιλητές'}</span>
                                </div>
                            )}

                            {meetingName && (
                                <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                                    <Icon name="FileText" size={12} color="#9ca3af" />
                                    <span className="line-clamp-1">{meetingName}</span>
                                </div>
                            )}
                        </div>

                        <div className="pt-2 border-t border-border/30 text-center">
                            <p className="text-xs text-muted-foreground">
                                Κάντε κλικ για λεπτομέρειες
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // City popup - unified layout for both supported and unsupported cities
        const name = feature.properties?.name;
        const isSupported = feature.properties?.officialSupport;
        const logoImage = feature.properties?.logoImage;
        const meetingsCount = feature.properties?.meetingsCount || 0;

        return (
            <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 max-w-sm">
                <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 flex-shrink-0">
                            {logoImage ? (
                                <img
                                    src={logoImage}
                                    alt={`${name} logo`}
                                    className="w-12 h-12 object-contain"
                                />
                            ) : (
                                <Icon name="Building2" size={48} color="#9ca3af" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-foreground leading-tight truncate">{name}</p>
                            {isSupported ? (
                                <div className="flex items-center gap-1 mt-1">
                                    <Icon name="BadgeCheck" size={12} color="#16a34a" />
                                    <span className="text-xs text-green-700">Υποστηριζόμενος Δήμος</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 mt-1">
                                    <Icon name="BadgeX" size={12} color="#9ca3af" />
                                    <span className="text-xs text-muted-foreground">Χωρίς επίσημη υποστήριξη</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {isSupported && meetingsCount > 0 && (
                        <div className="pt-2 border-t border-border/30 text-xs">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Icon name="Calendar" size={12} color="#9ca3af" />
                                <span>Συνεδριάσεις: <span className="font-medium text-foreground">{meetingsCount}</span></span>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground pt-1 pl-0 border-t border-border/30 mt-2">
                        {isSupported
                            ? 'Κάντε κλικ για προβολή του δήμου'
                            : 'Κάντε κλικ για να ζητήσετε την προσθήκη'
                        }
                    </p>
                </div>
            </div>
        );
    };

    const handleFeatureClick = (feature: GeoJSON.Feature) => {
        const featureType = feature.properties?.featureType;

        if (featureType === 'subject') {
            // Open subject sheet with full metadata
            setSubjectSheet({
                open: true,
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
            // Open unified city sheet for both supported and unsupported cities
            setCitySheet({
                open: true,
                cityId: feature.properties?.cityId || '',
                cityName: feature.properties?.name || '',
                logoImage: feature.properties?.logoImage,
                meetingsCount: feature.properties?.meetingsCount || 0,
                officialSupport: feature.properties?.officialSupport || false,
                supportsNotifications: feature.properties?.supportsNotifications || false
            });
        }
    };

    return (
        <div className="h-screen w-full relative">
            <Map
                features={features}
                animateRotation={false}
                center={[23.7275, 37.9838]} // Center on Athens
                zoom={7} // Show all of Greece
                pitch={0} // Top-down view for better polygon visibility
                renderPopup={renderPopup}
                onFeatureClick={handleFeatureClick}
                className="h-full w-full"
            />

            {/* Loading overlay when loading or updating */}
            {isUpdating && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className="flex items-center gap-3 text-white bg-black/80 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                        <span className="text-lg font-medium">Ενημέρωση χάρτη...</span>
                    </div>
                </div>
            )}

            {allTopics.length > 0 && (
                <>
                    <MapFilters
                        filters={filters}
                        allTopics={allTopics}
                        onFiltersChange={setFilters}
                    />
                    <MapExplainer />

                    {/* Map Summary - Subjects count, topics and timeframe info */}
                    <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden sm:block">
                        <div className="text-white bg-black/70 backdrop-blur-sm px-3 py-2 rounded-full text-xs font-medium">
                            <div className="flex items-center gap-2">
                                {/* Subjects count */}
                                <span>
                                    {features.filter(f => f.properties?.featureType === 'subject').length} θέματα
                                </span>
                                <span className="text-white/60">•</span>

                                {/* Topics selection */}
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

                                {/* Time period */}
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
