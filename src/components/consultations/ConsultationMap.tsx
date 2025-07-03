"use client";

import { useMemo } from "react";
import Map, { MapFeature } from "@/components/map/map";
import { cn } from "@/lib/utils";
import { ConsultationMapProps, GeoSetData, RegulationItem } from "@/lib/consultations/types";
import LayerControlsButton from "./LayerControlsButton";
import LayerControlsPanel from "./LayerControlsPanel";
import DetailPanel from "./DetailPanel";
import EditingToolsPanel from "./EditingToolsPanel";
import { computeDerivedGeometry, createLocationLineFeatures } from "@/lib/consultations/geometryUtils";
import { useEditedGeometries } from "@/hooks/consultations/useEditedGeometries";
import { useConsultationMapState } from "@/hooks/consultations/useConsultationMapState";

// All local interfaces have been moved to src/lib/consultations/types.ts

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

// All helper functions have been moved to src/lib/consultations/geometryUtils.ts

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

    // Custom hooks to manage state
    const { savedGeometries, deleteSavedGeometry } = useEditedGeometries();
    const mapState = useConsultationMapState({ regulationData, geoSets, cityId });

    // Handle map feature clicks
    const handleMapFeatureClick = (feature: GeoJSON.Feature) => {
        if (feature.properties?.id) {
            mapState.openGeometryDetail(feature.properties.id);
        }
    };

    // Convert enabled geometries to map features
    const mapFeatures: MapFeature[] = useMemo(() => {
        const features: MapFeature[] = [];

        geoSets.forEach((geoSet, geoSetIndex) => {
            if (!mapState.enabledGeoSets.has(geoSet.id)) return;

            // Use geoset's own color if available, otherwise fall back to default colors
            const color = geoSet.color || GEOSET_COLORS[geoSetIndex % GEOSET_COLORS.length];

            geoSet.geometries.forEach(geometry => {
                if (!mapState.enabledGeometries.has(geometry.id)) return;

                let geoJSON: GeoJSON.Geometry | null = null;
                let isFromLocalStorage = false;

                // First check if we have a saved geometry in localStorage
                if (savedGeometries[geometry.id]) {
                    geoJSON = savedGeometries[geometry.id];
                    isFromLocalStorage = true;
                }
                // Otherwise handle static geometries
                else if (geometry.type !== 'derived' && 'geojson' in geometry && geometry.geojson) {
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
                            isDerived: geometry.type === 'derived',
                            isFromLocalStorage
                        },
                        style: {
                            // Color: use blue for localStorage, otherwise use geoset color
                            fillColor: isFromLocalStorage ? '#3B82F6' : color,
                            // Opacity: derived geometries are very transparent, localStorage medium, regular normal
                            fillOpacity: geometry.type === 'derived' ? 0.15 : (isFromLocalStorage ? 0.5 : 0.4),
                            // Stroke: derived geometries have no stroke, localStorage get blue stroke, regular get geoset color
                            strokeColor: geometry.type === 'derived' ? 'transparent' : (isFromLocalStorage ? '#1D4ED8' : color),
                            // Stroke width: derived have none, points are smaller, localStorage get thicker stroke
                            strokeWidth: geometry.type === 'derived' ? 0 : (geometry.type === 'point' ? 4 : (isFromLocalStorage ? 3 : 2)),
                            label: geometry.name
                        }
                    });
                }
            });
        });

        // Add location features (points and lines) in editing mode
        if (mapState.isEditingMode && mapState.selectedLocations.length > 0) {
            const locationLineFeatures = createLocationLineFeatures(mapState.selectedLocations);
            features.push(...locationLineFeatures);
            
            if (mapState.selectedLocations.length === 1) {
                console.log(`📍 Added 1 prominent location marker`);
            } else {
                console.log(`🔗 Added ${locationLineFeatures.length} location features (${mapState.selectedLocations.length - 1} lines, ${mapState.selectedLocations.length} points)`);
            }
        }

        return features;
    }, [geoSets, mapState.enabledGeoSets, mapState.enabledGeometries, savedGeometries, mapState.isEditingMode, mapState.selectedLocations]);

    // Function to handle deleting saved geometry and updating local editing state
    const handleDeleteSavedGeometry = (geometryId: string) => {
        deleteSavedGeometry(geometryId);
        // If the deleted geometry was being edited, deselect it.
        if (mapState.selectedGeometryForEdit === geometryId) {
            mapState.handleSelectGeometryForEdit(null);
        }
    };

    const zoomToGeometry = useMemo(() => {
        if (!mapState.selectedGeometryForEdit) return null;
        return mapState.zoomGeometry;
    }, [mapState.selectedGeometryForEdit, mapState.zoomGeometry]);

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
                editingMode={mapState.isEditingMode}
                drawingMode={mapState.drawingMode}
                selectedGeometryForEdit={mapState.selectedGeometryForEdit}
                zoomToGeometry={zoomToGeometry}
            />

            {/* Editing Tools Panel */}
            {mapState.isEditingMode && mapState.selectedGeometryForEdit && (
                <EditingToolsPanel
                    selectedGeometryForEdit={mapState.selectedGeometryForEdit}
                    selectedGeometry={geoSets.flatMap(gs => gs.geometries).find(g => g.id === mapState.selectedGeometryForEdit)}
                    drawingMode={mapState.drawingMode}
                    cityData={mapState.cityData}
                    onSetDrawingMode={mapState.setDrawingMode}
                    onNavigateToLocation={mapState.handleNavigateToLocation}
                    onSelectedLocationsChange={mapState.handleSelectedLocationsChange}
                    onClose={() => mapState.handleSelectGeometryForEdit(null)}
                />
            )}

            {/* Layer Controls Toggle Button */}
            {geoSets.length > 0 && (
                <LayerControlsButton
                    isOpen={mapState.isControlsOpen}
                    activeCount={mapFeatures.length}
                    onToggle={() => mapState.setIsControlsOpen(!mapState.isControlsOpen)}
                />
            )}

            {/* Layer Controls Panel */}
            {mapState.isControlsOpen && geoSets.length > 0 && (
                <LayerControlsPanel
                    geoSets={geoSets}
                    colors={GEOSET_COLORS}
                    enabledGeometries={mapState.enabledGeometries}
                    expandedGeoSets={mapState.expandedGeoSets}
                    activeCount={mapFeatures.length}
                    onClose={() => mapState.setIsControlsOpen(false)}
                    onToggleGeoSet={mapState.toggleGeoSet}
                    onToggleExpansion={mapState.toggleGeoSetExpansion}
                    onToggleGeometry={mapState.toggleGeometry}
                    getGeoSetCheckboxState={mapState.getGeoSetCheckboxState}
                    onOpenGeoSetDetail={mapState.openGeoSetDetail}
                    onOpenGeometryDetail={mapState.openGeometryDetail}
                    contactEmail={regulationData?.contactEmail}
                    comments={comments}
                    consultationId={consultationId}
                    cityId={cityId}
                    currentUser={currentUser}
                    isEditingMode={mapState.isEditingMode}
                    selectedGeometryForEdit={mapState.selectedGeometryForEdit}
                    savedGeometries={savedGeometries}
                    regulationData={regulationData}
                    onToggleEditingMode={mapState.toggleEditingMode}
                    onSelectGeometryForEdit={mapState.handleSelectGeometryForEdit}
                    onDeleteSavedGeometry={handleDeleteSavedGeometry}
                />
            )}

            {/* Detail Panel */}
            <DetailPanel
                isOpen={mapState.detailType !== null}
                onClose={mapState.closeDetail}
                detailType={mapState.detailType}
                detailId={mapState.detailId}
                geoSets={geoSets}
                baseUrl={baseUrl}
                referenceFormat={referenceFormat}
                onReferenceClick={onReferenceClick}
                regulationData={regulationData || undefined}
                onOpenGeometryDetail={mapState.openGeometryDetail}
                onOpenGeoSetDetail={mapState.openGeoSetDetail}
                comments={comments}
                currentUser={currentUser}
                consultationId={consultationId}
                cityId={cityId}
                isEditingMode={mapState.isEditingMode}
                selectedGeometryForEdit={mapState.selectedGeometryForEdit}
                savedGeometries={savedGeometries}
            />
        </div>
    );
} 