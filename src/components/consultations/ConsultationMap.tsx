"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Map, { MapFeature } from "@/components/map/map";
import { cn } from "@/lib/utils";
import { RegulationData, RegulationItem, Geometry, ReferenceFormat, StaticGeometry, DerivedGeometry, BufferOperation, DifferenceOperation } from "./types";
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
    color?: string;
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

// Helper function to create a circular polygon buffer around a point
function createCircleBuffer(center: [number, number], radiusInMeters: number): GeoJSON.Polygon {
    const earthRadius = 6371000; // Earth's radius in meters
    const lat = center[1] * Math.PI / 180; // Convert to radians
    const lng = center[0] * Math.PI / 180;

    const points: [number, number][] = [];
    const numPoints = 64; // Number of points to create the circle

    for (let i = 0; i < numPoints; i++) {
        const angle = (i * 360 / numPoints) * Math.PI / 180;

        // Calculate offset in radians
        const dLat = radiusInMeters * Math.cos(angle) / earthRadius;
        const dLng = radiusInMeters * Math.sin(angle) / (earthRadius * Math.cos(lat));

        // Convert back to degrees
        const newLat = (lat + dLat) * 180 / Math.PI;
        const newLng = (lng + dLng) * 180 / Math.PI;

        points.push([newLng, newLat]);
    }

    // Close the polygon by adding the first point at the end
    points.push(points[0]);

    return {
        type: 'Polygon',
        coordinates: [points]
    };
}

// Helper function to compute derived geometry
function computeDerivedGeometry(derivedGeometry: DerivedGeometry, allGeoSets: GeoSetData[]): GeoJSON.Geometry | null {
    const { derivedFrom } = derivedGeometry;

    if (derivedFrom.operation === 'buffer') {
        const bufferOp = derivedFrom as BufferOperation;
        const sourceGeoSet = allGeoSets.find(gs => gs.id === bufferOp.sourceGeoSetId);

        if (!sourceGeoSet) {
            console.warn(`Source GeoSet not found: ${bufferOp.sourceGeoSetId}`);
            return null;
        }

        // Convert radius to meters
        const radiusInMeters = bufferOp.units === 'kilometers' ? bufferOp.radius * 1000 : bufferOp.radius;

        // For buffer operations, we'll create individual circles for each point
        // and combine them into a MultiPolygon for simplicity
        const polygons: number[][][][] = [];

        sourceGeoSet.geometries.forEach(geometry => {
            if (geometry.type === 'point') {
                const staticGeometry = geometry as StaticGeometry;
                if (staticGeometry.geojson && staticGeometry.geojson.type === 'Point') {
                    const circle = createCircleBuffer(
                        staticGeometry.geojson.coordinates as [number, number],
                        radiusInMeters
                    );
                    polygons.push(circle.coordinates);
                }
            }
        });

        if (polygons.length === 0) {
            return null;
        }

        // Return as MultiPolygon if we have multiple circles, or Polygon if just one
        if (polygons.length === 1) {
            return {
                type: 'Polygon',
                coordinates: polygons[0]
            };
        } else {
            return {
                type: 'MultiPolygon',
                coordinates: polygons
            };
        }
    }

    // TODO: Implement difference operation
    if (derivedFrom.operation === 'difference') {
        console.warn('Difference operation not yet implemented');
        return null;
    }

    return null;
}

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
                color: item.color,
                geometries: item.geometries || []
            }));
    }, [regulationData]);

    // Initialize enabled states when geosets change
    useMemo(() => {
        const allGeoSetIds = new Set(geoSets.map(gs => gs.id));
        const allGeometryIds = new Set(geoSets.flatMap(gs => gs.geometries.map(g => g.id)));

        // Check if defaultVisibleGeosets is specified in regulation data
        if (regulationData?.defaultVisibleGeosets && regulationData.defaultVisibleGeosets.length > 0) {
            // Only enable geosets specified in defaultVisibleGeosets
            const defaultVisibleSet = new Set(regulationData.defaultVisibleGeosets);
            const enabledGeoSetIds = new Set(
                geoSets
                    .filter(gs => defaultVisibleSet.has(gs.id))
                    .map(gs => gs.id)
            );

            const enabledGeometryIds = new Set(
                geoSets
                    .filter(gs => defaultVisibleSet.has(gs.id))
                    .flatMap(gs => gs.geometries.map(g => g.id))
            );

            setEnabledGeoSets(enabledGeoSetIds);
            setEnabledGeometries(enabledGeometryIds);
        } else {
            // Default behavior: enable all geosets and geometries
            setEnabledGeoSets(allGeoSetIds);
            setEnabledGeometries(allGeometryIds);
        }

        setExpandedGeoSets(new Set()); // Start with all collapsed
    }, [geoSets, regulationData]);

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

            // Use geoset's own color if available, otherwise fall back to default colors
            const color = geoSet.color || GEOSET_COLORS[geoSetIndex % GEOSET_COLORS.length];

            geoSet.geometries.forEach(geometry => {
                if (!enabledGeometries.has(geometry.id)) return;

                let geoJSON: GeoJSON.Geometry | null = null;

                // Handle static geometries
                if (geometry.type !== 'derived' && 'geojson' in geometry && geometry.geojson) {
                    geoJSON = geometry.geojson;
                }
                // Handle derived geometries
                else if (geometry.type === 'derived') {
                    geoJSON = computeDerivedGeometry(geometry, geoSets);
                }

                // Only add to features if we have valid geometry
                if (geoJSON) {
                    features.push({
                        id: geometry.id,
                        geometry: geoJSON,
                        properties: {
                            geoSetId: geoSet.id,
                            geoSetName: geoSet.name,
                            name: geometry.name,
                            description: geometry.description,
                            isDerived: geometry.type === 'derived'
                        },
                        style: {
                            fillColor: color,
                            fillOpacity: geometry.type === 'derived' ? 0.15 : 0.4, // Much more transparent for derived geometries
                            strokeColor: geometry.type === 'derived' ? 'transparent' : color, // No outline for derived geometries
                            strokeWidth: geometry.type === 'derived' ? 0 : (geometry.type === 'point' ? 8 : 2), // No stroke for derived geometries
                            label: geometry.name
                        }
                    });
                }
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
                    regulationData={regulationData ?? undefined}
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