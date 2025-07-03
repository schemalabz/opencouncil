import { useState, useMemo, useEffect, useCallback } from "react";
import { RegulationData, GeoSetData } from "@/lib/consultations/types";
import { Location } from "@/lib/types/onboarding";
import { CheckboxState } from "@/components/consultations/GeoSetItem";

interface UseConsultationMapStateProps {
    regulationData?: RegulationData | null;
    geoSets: GeoSetData[];
    cityId?: string;
}

export function useConsultationMapState({ 
    regulationData, 
    geoSets, 
    cityId 
}: UseConsultationMapStateProps) {
    // Layer controls state
    const [isControlsOpen, setIsControlsOpen] = useState(false);
    const [enabledGeoSets, setEnabledGeoSets] = useState<Set<string>>(new Set());
    const [enabledGeometries, setEnabledGeometries] = useState<Set<string>>(new Set());
    const [expandedGeoSets, setExpandedGeoSets] = useState<Set<string>>(new Set());

    // Detail panel state
    const [detailType, setDetailType] = useState<'geoset' | 'geometry' | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);

    // Editing state
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [drawingMode, setDrawingMode] = useState<'point' | 'polygon'>('point');
    const [selectedGeometryForEdit, setSelectedGeometryForEdit] = useState<string | null>(null);
    
    // Map interaction state
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
    const [zoomGeometry, setZoomGeometry] = useState<GeoJSON.Geometry | null>(null);
    
    // City data state
    const [cityData, setCityData] = useState<any>(null);

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

    // Fetch city data when cityId changes
    useEffect(() => {
        if (cityId) {
            fetch(`/api/cities/${cityId}`)
                .then(res => res.json())
                .then(data => {
                    setCityData(data); // Store complete city data including geometry
                })
                .catch(error => {
                    console.error('Error fetching city data:', error);
                });
        }
    }, [cityId]);

    const closeDetail = useCallback(() => {
        setDetailType(null);
        setDetailId(null);
        // Remove hash from URL
        if (window.location.hash) {
            // Use history.pushState to remove hash without page reload
            const url = window.location.href.split('#')[0];
            window.history.pushState({}, '', url);
        }
    }, []);

    const openDetailFromId = useCallback((id: string) => {
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
    }, [geoSets, closeDetail]);

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
    }, [geoSets, openDetailFromId, closeDetail]);

    // Functions to manage detail panel
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
        const parentGeoSet = geoSets.find(gs => gs.geometries.some(g => g.id === geometryId));

        let newEnabledGeometries: Set<string> | undefined;
        setEnabledGeometries(prev => {
            const newSet = new Set(prev);
            if (newSet.has(geometryId)) {
                newSet.delete(geometryId);
            } else {
                newSet.add(geometryId);
            }
            newEnabledGeometries = newSet;
            return newSet;
        });

        if (parentGeoSet && newEnabledGeometries) {
            setEnabledGeoSets(prevGeoSets => {
                const newGeoSets = new Set(prevGeoSets);
                const enabledCount = parentGeoSet.geometries.filter(g => (newEnabledGeometries as Set<string>).has(g.id)).length;
                
                if (enabledCount > 0) {
                    newGeoSets.add(parentGeoSet.id);
                } else {
                    newGeoSets.delete(parentGeoSet.id);
                }
                return newGeoSets;
            });
        }
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

    // Function to handle geometry selection for editing with auto-zoom
    const handleSelectGeometryForEdit = (geometryId: string | null) => {
        setSelectedGeometryForEdit(geometryId);
        
        if (geometryId) {
            // Find the geometry to zoom to
            const geometry = geoSets.flatMap(gs => gs.geometries).find(g => g.id === geometryId);
            if (geometry) {
                let geoJSON: GeoJSON.Geometry | null = null;
                
                // Check for saved geometry first (this would need to be passed in or accessed differently)
                // For now, we'll just handle the original geometry
                if (geometry.type !== 'derived' && 'geojson' in geometry && geometry.geojson) {
                    geoJSON = geometry.geojson;
                }
                
                // Store geometry for zooming
                if (geoJSON) {
                    setZoomGeometry(geoJSON);
                    console.log('🎯 Selected geometry for editing and zoom:', geometryId);
                }
            }
        }
    };

    // Handle navigation to location (for location search)
    const handleNavigateToLocation = (coordinates: [number, number]) => {
        // Create a point geometry for the location and set it for zooming
        const pointGeometry: GeoJSON.Geometry = {
            type: 'Point',
            coordinates: coordinates
        };
        setZoomGeometry(pointGeometry);
        console.log('🗺️ Navigating to location:', coordinates);
    };

    // Handle selected locations change from LocationNavigator
    const handleSelectedLocationsChange = useCallback((locations: Location[]) => {
        setSelectedLocations(locations);
        console.log('📍 Updated selected locations:', locations.map(l => l.text));
    }, []);

    const toggleEditingMode = (enabled: boolean) => {
        setIsEditingMode(enabled);
        if (!enabled) {
            setSelectedGeometryForEdit(null);
            // Clear selected locations when exiting editing mode
            setSelectedLocations([]);
        }
    };

    return {
        // Layer controls state
        isControlsOpen,
        setIsControlsOpen,
        enabledGeoSets,
        enabledGeometries,
        expandedGeoSets,

        // Detail panel state
        detailType,
        detailId,
        closeDetail,
        openGeoSetDetail,
        openGeometryDetail,

        // Editing state
        isEditingMode,
        drawingMode,
        setDrawingMode,
        selectedGeometryForEdit,
        toggleEditingMode,
        handleSelectGeometryForEdit,

        // Map interaction state
        selectedLocations,
        zoomGeometry,
        handleNavigateToLocation,
        handleSelectedLocationsChange,

        // City data
        cityData,

        // Layer control functions
        getGeoSetCheckboxState,
        toggleGeoSet,
        toggleGeometry,
        toggleGeoSetExpansion,
    };
} 