"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Map, { MapFeature } from "@/components/map/map";
import { cn } from "@/lib/utils";
import { RegulationData, RegulationItem, Geometry, ReferenceFormat } from "./types";
import LayerControlsButton from "./LayerControlsButton";
import LayerControlsPanel from "./LayerControlsPanel";
import DetailPanel from "./DetailPanel";
import { CheckboxState } from "./GeoSetItem";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface ConsultationMapProps {
    className?: string;
    regulationData?: RegulationData | null;
    baseUrl: string;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    comments?: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId?: string;
    cityId?: string;
}

interface GeoSetData {
    id: string;
    name: string;
    description?: string;
    geometries: Geometry[];
}

// Generate distinct colors for different geosets
const GEOSET_COLORS = [
    '#627BBC', // Primary blue
    '#E53E3E', // Red
    '#38A169', // Green
    '#DD6B20', // Orange
    '#805AD5', // Purple
    '#319795', // Teal
    '#D53F8C', // Pink
    '#4A5568', // Gray
];

export default function ConsultationMap({
    className,
    regulationData,
    baseUrl,
    referenceFormat,
    onReferenceClick,
    comments,
    currentUser,
    consultationId,
    cityId
}: ConsultationMapProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isControlsOpen, setIsControlsOpen] = useState(false);
    const [enabledGeoSets, setEnabledGeoSets] = useState<Set<string>>(new Set());
    const [enabledGeometries, setEnabledGeometries] = useState<Set<string>>(new Set());
    const [expandedGeoSets, setExpandedGeoSets] = useState<Set<string>>(new Set());

    // Detail panel state
    const [detailType, setDetailType] = useState<'geoset' | 'geometry' | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);

    // Extract geosets from regulation data
    const geoSets: GeoSetData[] = useMemo(() => {
        if (!regulationData) return [];

        return regulationData.regulation
            .filter((item): item is RegulationItem & { type: 'geoset' } => item.type === 'geoset')
            .map(item => ({
                id: item.id,
                name: item.name || item.title || 'Unnamed GeoSet',
                description: item.description,
                geometries: item.geometries || []
            }));
    }, [regulationData]);

    // Initialize enabled states when geosets change
    useMemo(() => {
        const allGeoSetIds = new Set(geoSets.map(gs => gs.id));
        const allGeometryIds = new Set(geoSets.flatMap(gs => gs.geometries.map(g => g.id)));

        setEnabledGeoSets(allGeoSetIds);
        setEnabledGeometries(allGeometryIds);
        setExpandedGeoSets(allGeoSetIds); // Start with all expanded
    }, [geoSets]);

    // Handle URL hash changes to open detail panels
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.substring(1); // Remove #
            if (hash) {
                openDetailFromId(hash);
            } else {
                closeDetail();
            }
        };

        // Check initial hash
        handleHashChange();

        // Listen for hash changes
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [geoSets]);

    // Functions to manage detail panel
    const openDetailFromId = (id: string) => {
        // Check if it's a geoset
        const geoSet = geoSets.find(gs => gs.id === id);
        if (geoSet) {
            setDetailType('geoset');
            setDetailId(id);
            return;
        }

        // Check if it's a geometry
        const geometry = geoSets.flatMap(gs => gs.geometries).find(g => g.id === id);
        if (geometry) {
            setDetailType('geometry');
            setDetailId(id);
            return;
        }

        // If not found, close detail
        closeDetail();
    };

    const openGeoSetDetail = (geoSetId: string) => {
        setDetailType('geoset');
        setDetailId(geoSetId);
        // Update URL hash without triggering navigation
        window.location.hash = geoSetId;
    };

    const openGeometryDetail = (geometryId: string) => {
        setDetailType('geometry');
        setDetailId(geometryId);
        // Update URL hash without triggering navigation
        window.location.hash = geometryId;
    };

    const closeDetail = () => {
        setDetailType(null);
        setDetailId(null);
        // Remove hash from URL
        if (window.location.hash) {
            // Use history.pushState to remove hash without page reload
            const url = window.location.href.split('#')[0];
            window.history.pushState({}, '', url);
        }
    };

    // Handle map feature clicks
    const handleMapFeatureClick = (feature: GeoJSON.Feature) => {
        if (feature.properties?.id) {
            openGeometryDetail(feature.properties.id);
        }
    };

    // Convert enabled geometries to map features
    const mapFeatures: MapFeature[] = useMemo(() => {
        const features: MapFeature[] = [];

        geoSets.forEach((geoSet, geoSetIndex) => {
            if (!enabledGeoSets.has(geoSet.id)) return;

            const color = GEOSET_COLORS[geoSetIndex % GEOSET_COLORS.length];

            geoSet.geometries.forEach(geometry => {
                if (!enabledGeometries.has(geometry.id)) return;

                features.push({
                    id: geometry.id,
                    geometry: geometry.geojson,
                    properties: {
                        geoSetId: geoSet.id,
                        geoSetName: geoSet.name,
                        name: geometry.name,
                        description: geometry.description
                    },
                    style: {
                        fillColor: color,
                        fillOpacity: 0.4,
                        strokeColor: color,
                        strokeWidth: geometry.type === 'point' ? 8 : 2,
                        label: geometry.name
                    }
                });
            });
        });

        return features;
    }, [geoSets, enabledGeoSets, enabledGeometries]);

    // Get geoset checkbox state (checked, indeterminate, or unchecked)
    const getGeoSetCheckboxState = (geoSetId: string): CheckboxState => {
        const geoSet = geoSets.find(gs => gs.id === geoSetId);
        if (!geoSet || geoSet.geometries.length === 0) return 'unchecked';

        const enabledCount = geoSet.geometries.filter(g => enabledGeometries.has(g.id)).length;

        if (enabledCount === 0) return 'unchecked';
        if (enabledCount === geoSet.geometries.length) return 'checked';
        return 'indeterminate';
    };

    const toggleGeoSet = (geoSetId: string) => {
        const geoSet = geoSets.find(gs => gs.id === geoSetId);
        if (!geoSet) return;

        const currentState = getGeoSetCheckboxState(geoSetId);

        if (currentState === 'checked') {
            // If all are checked, uncheck all
            setEnabledGeoSets(prev => {
                const newSet = new Set(prev);
                newSet.delete(geoSetId);
                return newSet;
            });
            setEnabledGeometries(prev => {
                const newSet = new Set(prev);
                geoSet.geometries.forEach(g => newSet.delete(g.id));
                return newSet;
            });
        } else {
            // If none or some are checked, check all
            setEnabledGeoSets(prev => new Set(prev).add(geoSetId));
            setEnabledGeometries(prev => {
                const newSet = new Set(prev);
                geoSet.geometries.forEach(g => newSet.add(g.id));
                return newSet;
            });
        }
    };

    const toggleGeometry = (geometryId: string) => {
        setEnabledGeometries(prev => {
            const newSet = new Set(prev);
            if (newSet.has(geometryId)) {
                newSet.delete(geometryId);
            } else {
                newSet.add(geometryId);
            }
            return newSet;
        });
    };

    const toggleGeoSetExpansion = (geoSetId: string) => {
        setExpandedGeoSets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(geoSetId)) {
                newSet.delete(geoSetId);
            } else {
                newSet.add(geoSetId);
            }
            return newSet;
        });
    };

    return (
        <div className={cn("relative", className)}>
            {/* Map */}
            <Map
                center={[23.7275, 37.9755]} // Athens coordinates
                zoom={11}
                animateRotation={false}
                features={mapFeatures}
                onFeatureClick={handleMapFeatureClick}
                className="w-full h-full"
            />

            {/* Layer Controls Toggle Button */}
            {geoSets.length > 0 && (
                <LayerControlsButton
                    isOpen={isControlsOpen}
                    activeCount={mapFeatures.length}
                    onToggle={() => setIsControlsOpen(!isControlsOpen)}
                />
            )}

            {/* Layer Controls Panel */}
            {isControlsOpen && geoSets.length > 0 && (
                <LayerControlsPanel
                    geoSets={geoSets}
                    colors={GEOSET_COLORS}
                    enabledGeometries={enabledGeometries}
                    expandedGeoSets={expandedGeoSets}
                    activeCount={mapFeatures.length}
                    onClose={() => setIsControlsOpen(false)}
                    onToggleGeoSet={toggleGeoSet}
                    onToggleExpansion={toggleGeoSetExpansion}
                    onToggleGeometry={toggleGeometry}
                    getGeoSetCheckboxState={getGeoSetCheckboxState}
                    onOpenGeoSetDetail={openGeoSetDetail}
                    onOpenGeometryDetail={openGeometryDetail}
                    contactEmail={regulationData?.contactEmail}
                    comments={comments}
                    consultationId={consultationId}
                    cityId={cityId}
                />
            )}

            {/* Detail Panel */}
            <DetailPanel
                isOpen={detailType !== null}
                onClose={closeDetail}
                detailType={detailType}
                detailId={detailId}
                geoSets={geoSets}
                baseUrl={baseUrl}
                referenceFormat={referenceFormat}
                onReferenceClick={onReferenceClick}
                regulationData={regulationData || undefined}
                onOpenGeometryDetail={openGeometryDetail}
                onOpenGeoSetDetail={openGeoSetDetail}
                comments={comments}
                currentUser={currentUser}
                consultationId={consultationId}
                cityId={cityId}
            />
        </div>
    );
} 