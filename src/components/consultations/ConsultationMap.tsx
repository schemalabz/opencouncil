"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Map, { MapFeature } from "@/components/map/map";
import { cn } from "@/lib/utils";
import { RegulationData, RegulationItem, Geometry, ReferenceFormat, StaticGeometry, DerivedGeometry, BufferOperation, DifferenceOperation, CurrentUser, GeoSetData, SEARCH_COLORS } from "./types";
import LayerControlsButton from "./LayerControlsButton";
import LayerControlsPanel from "./LayerControlsPanel";
import DetailPanel from "./DetailPanel";
import EditingToolsPanel from "./EditingToolsPanel";
import { CheckboxState } from "./GeoSetItem";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { Location } from "@/lib/types/onboarding";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

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
    onShowInfo?: () => void;
    onDrawerStateChange?: (isOpen: boolean) => void;
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

// Helper function to create line features between selected locations
function createLocationLineFeatures(locations: Location[]): MapFeature[] {
    if (locations.length === 0) return [];

    const lineFeatures: MapFeature[] = [];

    // Create lines between consecutive locations (only if we have 2 or more)
    if (locations.length >= 2) {
        for (let i = 0; i < locations.length - 1; i++) {
            const startLocation = locations[i];
            const endLocation = locations[i + 1];

            const lineGeometry: GeoJSON.LineString = {
                type: 'LineString',
                coordinates: [
                    startLocation.coordinates,
                    endLocation.coordinates
                ]
            };

            lineFeatures.push({
                id: `location-line-${i}`,
                geometry: lineGeometry,
                properties: {
                    type: 'location-line',
                    startLocation: startLocation.text,
                    endLocation: endLocation.text,
                    segmentIndex: i
                },
                style: {
                    strokeColor: '#EF4444', // Red color for visibility
                    strokeWidth: 3,
                    fillOpacity: 0 // Lines don't need fill
                }
            });
        }
    }

    // Create point features for each location (works for single or multiple locations)
    locations.forEach((location, index) => {
        lineFeatures.push({
            id: `location-point-${index}`,
            geometry: {
                type: 'Point',
                coordinates: location.coordinates
            },
            properties: {
                type: 'location-point',
                locationText: location.text,
                locationIndex: index,
                isSingleLocation: locations.length === 1
            },
            style: {
                fillColor: '#EF4444',
                fillOpacity: 0.9, // Slightly more opaque for better visibility
                strokeColor: '#B91C1C',
                strokeWidth: locations.length === 1 ? 12 : 10, // Bigger for single location, large for multiple
                label: locations.length === 1 ? '📍' : `${index + 1}` // Pin emoji for single, numbers for multiple
            }
        });
    });

    return lineFeatures;
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
    cityId,
    onShowInfo,
    onDrawerStateChange
}: ConsultationMapProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isMobile = useIsMobile();

    const [isControlsOpen, setIsControlsOpen] = useState(true);
    const [enabledGeoSets, setEnabledGeoSets] = useState<Set<string>>(new Set());
    const [enabledGeometries, setEnabledGeometries] = useState<Set<string>>(new Set());
    const [expandedGeoSets, setExpandedGeoSets] = useState<Set<string>>(new Set());

    // Detail panel state
    const [detailType, setDetailType] = useState<'geoset' | 'geometry' | 'search-location' | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [selectedSearchLocationIndex, setSelectedSearchLocationIndex] = useState<number | null>(null);

    // Editing state
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [drawingMode, setDrawingMode] = useState<'point' | 'polygon'>('point');
    const [selectedGeometryForEdit, setSelectedGeometryForEdit] = useState<string | null>(null);
    
    // Local storage state for saved geometries
    const [savedGeometries, setSavedGeometries] = useState<Record<string, any>>({});

    // State for selected locations (for line drawing)
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

    // Search locations state (shown when user searches addresses in the community picker)
    const [searchLocations, setSearchLocations] = useState<Location[]>([]);

    // The actively viewed search location (passed directly to DetailPanel to avoid index timing issues)
    const [activeSearchLocation, setActiveSearchLocation] = useState<Location | null>(null);

    // Ref to prevent hash handler from overriding search-location detail mode
    const isInSearchLocationMode = useRef(false);

    // Report drawer state to parent (for ViewToggleButton positioning)
    useEffect(() => {
        const anyDrawerOpen = isControlsOpen || detailType !== null;
        onDrawerStateChange?.(anyDrawerOpen);
    }, [isControlsOpen, detailType, onDrawerStateChange]);

    // Load saved geometries from localStorage on mount and when editing mode changes
    useEffect(() => {
        const loadSavedGeometries = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
                
                // Only update state if the data actually changed (deep comparison)
                setSavedGeometries(prev => {
                    const hasChanged = JSON.stringify(prev) !== JSON.stringify(saved);
                    return hasChanged ? saved : prev;
                });
            } catch (error) {
                console.error('Error loading saved geometries:', error);
                setSavedGeometries({});
            }
        };

        loadSavedGeometries();

        // Listen for localStorage changes (from other tabs)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'opencouncil-edited-geometries') {
                loadSavedGeometries();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        
        // Custom event for same-tab localStorage changes (we'll dispatch this from the map component)
        const handleCustomStorageChange = () => {
            loadSavedGeometries();
        };

        window.addEventListener('opencouncil-storage-change', handleCustomStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('opencouncil-storage-change', handleCustomStorageChange);
        };
    }, []);

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

    const closeDetail = useCallback(() => {
        isInSearchLocationMode.current = false;
        setDetailType(null);
        setDetailId(null);
        setSelectedSearchLocationIndex(null);
        setActiveSearchLocation(null);
        // Remove hash from URL
        if (window.location.hash) {
            // Use history.pushState to remove hash without page reload
            const url = window.location.href.split('#')[0];
            window.history.pushState({}, '', url);
        }
    }, []);

    // Find the zoomable GeoJSON for a geometry by id
    const findGeometryGeoJSON = useCallback((geometryId: string): GeoJSON.Geometry | null => {
        const geometry = geoSets.flatMap(gs => gs.geometries).find(g => g.id === geometryId);
        if (!geometry) return null;

        if (savedGeometries[geometry.id]) return savedGeometries[geometry.id];
        if (geometry.type !== 'derived' && 'geojson' in geometry && geometry.geojson) return geometry.geojson;
        if (geometry.type === 'derived') return computeDerivedGeometry(geometry, geoSets);
        return null;
    }, [geoSets, savedGeometries]);

    const openDetailFromId = useCallback((id: string) => {
        // Don't override search-location detail
        if (isInSearchLocationMode.current) return;

        // Check if it's a geoset
        const geoSet = geoSets.find(gs => gs.id === id);
        if (geoSet) {
            setDetailType('geoset');
            setDetailId(id);

            // Zoom to fit all point geometries in the geoset (shows address labels)
            const pointGeometries = geoSet.geometries
                .filter(g => g.type === 'point')
                .map(g => findGeometryGeoJSON(g.id))
                .filter((g): g is GeoJSON.Geometry => g !== null);

            if (pointGeometries.length > 0) {
                const collection: GeoJSON.GeometryCollection = {
                    type: 'GeometryCollection',
                    geometries: pointGeometries
                };
                setZoomGeometry(collection);
            } else {
                // Fallback to boundary polygon if no points
                const boundaryGeometry = geoSet.geometries.find(g => g.type === 'polygon');
                if (boundaryGeometry) {
                    const geoJSON = findGeometryGeoJSON(boundaryGeometry.id);
                    if (geoJSON) setZoomGeometry(geoJSON);
                }
            }
            return;
        }

        // Check if it's a geometry
        const geometry = geoSets.flatMap(gs => gs.geometries).find(g => g.id === id);
        if (geometry) {
            setDetailType('geometry');
            setDetailId(id);

            // Zoom to the geometry
            const geoJSON = findGeometryGeoJSON(id);
            if (geoJSON) setZoomGeometry(geoJSON);
            return;
        }

        // If not found, close detail
        closeDetail();
    }, [geoSets, closeDetail, findGeometryGeoJSON]);

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
        isInSearchLocationMode.current = false;
        if (isMobile) setIsControlsOpen(false);
        setDetailType('geoset');
        setDetailId(geoSetId);
        setSelectedSearchLocationIndex(null);
        // Update URL hash without triggering navigation
        window.location.hash = geoSetId;
    };

    const openGeometryDetail = (geometryId: string) => {
        isInSearchLocationMode.current = false;
        if (isMobile) setIsControlsOpen(false);
        setDetailType('geometry');
        setDetailId(geometryId);
        setSelectedSearchLocationIndex(null);
        // Update URL hash without triggering navigation
        window.location.hash = geometryId;
    };

    const openSearchLocationDetail = (location: Location, locationIndex: number) => {
        isInSearchLocationMode.current = true;
        if (isMobile) setIsControlsOpen(false);
        setDetailType('search-location');
        setDetailId(`search-location-${locationIndex}`);
        setSelectedSearchLocationIndex(locationIndex);
        setActiveSearchLocation(location);
        // Clear hash so it doesn't conflict (use pushState to avoid triggering hashchange)
        if (window.location.hash) {
            const url = window.location.href.split('#')[0];
            window.history.pushState({}, '', url);
        }
    };

    // Handle map feature clicks
    const handleMapFeatureClick = (feature: GeoJSON.Feature) => {
        // Clicking a search location pin opens its detail panel
        if (feature.properties?.type === 'search-location') {
            const pinIndex = searchLocations.findIndex(l => l.text === feature.properties?.name);
            if (pinIndex >= 0) {
                openSearchLocationDetail(searchLocations[pinIndex], pinIndex);
            }
            return;
        }

        if (feature.properties?.id) {
            const geometryId = feature.properties.id;

            // Check if this is a polygon in a geoset with other geometries
            // If so, open the parent geoset (e.g. clicking community boundary opens the community)
            const parentGeoSet = geoSets.find(gs => gs.geometries.some(g => g.id === geometryId));
            const clickedGeometry = parentGeoSet?.geometries.find(g => g.id === geometryId);

            if (clickedGeometry?.type === 'polygon' && parentGeoSet && parentGeoSet.geometries.length > 1) {
                openGeoSetDetail(parentGeoSet.id);
                // Zoom to the polygon
                if (feature.geometry) {
                    setZoomGeometry(feature.geometry);
                }
            } else {
                openGeometryDetail(geometryId);
                // Zoom to the clicked feature's geometry
                if (feature.geometry) {
                    setZoomGeometry(feature.geometry);
                }
            }
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
                    // For point features, show the address as the map label
                    // For boundary polygons in a geoset, use the geoset name (without "- Όρια")
                    let label: string;
                    if (geometry.type === 'point' && geometry.textualDefinition) {
                        label = geometry.textualDefinition;
                    } else if (geometry.type === 'polygon' && geoSet.geometries.length > 1) {
                        label = geoSet.name;
                    } else {
                        label = geometry.name;
                    }

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
                            label
                        }
                    });
                }
            });
        });

        // Add location features (points and lines) in editing mode
        if (isEditingMode && selectedLocations.length > 0) {
            const locationLineFeatures = createLocationLineFeatures(selectedLocations);
            features.push(...locationLineFeatures);
        }

        // Add search location pins (user searched addresses in the community picker)
        if (!isEditingMode && searchLocations.length > 0) {
            searchLocations.forEach((location, index) => {
                const color = SEARCH_COLORS[index % SEARCH_COLORS.length];
                features.push({
                    id: `search-location-${index}`,
                    geometry: {
                        type: 'Point',
                        coordinates: location.coordinates
                    },
                    properties: {
                        type: 'search-location',
                        name: location.text,
                        alwaysShowLabel: true
                    },
                    style: {
                        fillColor: color,
                        fillOpacity: 0.95,
                        strokeColor: '#ffffff',
                        strokeWidth: searchLocations.length === 1 ? 14 : 12,
                        label: location.text
                    }
                });
            });
        }

        return features;
    }, [geoSets, enabledGeoSets, enabledGeometries, savedGeometries, isEditingMode, selectedLocations, searchLocations]);

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
            const geoJSON = findGeometryGeoJSON(geometryId);
            if (geoJSON) {
                setZoomGeometry(geoJSON);
            }
        }
    };

    // State for geometry to zoom to
    const [zoomGeometry, setZoomGeometry] = useState<GeoJSON.Geometry | null>(null);
    const [hasInitialFit, setHasInitialFit] = useState(false);

    // City data state
    const [cityData, setCityData] = useState<any>(null);

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

    // Handle navigation to location (for location search)
    const handleNavigateToLocation = (coordinates: [number, number]) => {
        const pointGeometry: GeoJSON.Geometry = {
            type: 'Point',
            coordinates: coordinates
        };
        setZoomGeometry(pointGeometry);
    };

    // Handle selected locations change from LocationNavigator
    const handleSelectedLocationsChange = useCallback((locations: Location[]) => {
        setSelectedLocations(locations);
    }, []);

    // Apply a searched location's coordinates as the current geometry's point
    const handleApplyLocationToGeometry = useCallback((coordinates: [number, number]) => {
        if (!selectedGeometryForEdit) return;
        try {
            const saved = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
            saved[selectedGeometryForEdit] = {
                type: 'Point',
                coordinates: coordinates
            };
            localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(saved));
            setSavedGeometries({ ...saved });
            window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));
        } catch (error) {
            console.error('Error applying location to geometry:', error);
        }
    }, [selectedGeometryForEdit]);

    // Function to handle deleting saved geometry
    const handleDeleteSavedGeometry = (geometryId: string) => {
        try {
            const savedGeometries = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
            delete savedGeometries[geometryId];
            localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(savedGeometries));
            
            // IMMEDIATELY update local state to reflect the change
            setSavedGeometries(savedGeometries);
            
            // Dispatch custom event to notify components of localStorage change
            window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));
            
            // If the deleted geometry was selected for editing, deselect it
            if (selectedGeometryForEdit === geometryId) {
                setSelectedGeometryForEdit(null);
            }
        } catch (error) {
            console.error('Error deleting saved geometry:', error);
        }
    };

    // Fit map to all features on initial load (unless a hash navigation already set a zoom target)
    useEffect(() => {
        if (hasInitialFit || zoomGeometry) return;
        if (mapFeatures.length === 0) return;

        const geometries = mapFeatures.map(f => f.geometry);
        const collection: GeoJSON.GeometryCollection = {
            type: 'GeometryCollection',
            geometries
        };
        setZoomGeometry(collection);
        setHasInitialFit(true);
    }, [mapFeatures, hasInitialFit, zoomGeometry]);

    const zoomToGeometry = zoomGeometry;

    // On mobile, offset zoom target upward to account for bottom sheet covering ~40% of screen
    const anyDrawerOpen = isControlsOpen || detailType !== null;
    const mapZoomPadding = isMobile && anyDrawerOpen
        ? { top: 60, bottom: Math.round(window.innerHeight * 0.35), left: 40, right: 40 }
        : 100;

    return (
        <div className={cn("relative", className)}>
            {/* Map */}
            <Map
                center={[23.7275, 37.9755]} // Athens fallback
                zoom={12}
                animateRotation={false}
                features={mapFeatures}
                onFeatureClick={handleMapFeatureClick}
                className="w-full h-full"
                editingMode={isEditingMode}
                showStreetLabels={true}
                drawingMode={drawingMode}
                selectedGeometryForEdit={selectedGeometryForEdit}
                zoomToGeometry={zoomToGeometry}
                zoomPadding={mapZoomPadding}
            />

            {/* Editing Tools Panel */}
            {isEditingMode && selectedGeometryForEdit && (
                <EditingToolsPanel
                    selectedGeometryForEdit={selectedGeometryForEdit}
                    selectedGeometry={geoSets.flatMap(gs => gs.geometries).find(g => g.id === selectedGeometryForEdit)}
                    drawingMode={drawingMode}
                    cityData={cityData}
                    onSetDrawingMode={setDrawingMode}
                    onNavigateToLocation={handleNavigateToLocation}
                    onSelectedLocationsChange={handleSelectedLocationsChange}
                    onApplyLocationToGeometry={handleApplyLocationToGeometry}
                    onClose={() => handleSelectGeometryForEdit(null)}
                />
            )}

            {/* Layer Controls Toggle Button */}
            {geoSets.length > 0 && (
                <LayerControlsButton
                    isOpen={isControlsOpen}
                    activeCount={mapFeatures.length}
                    onToggle={() => setIsControlsOpen(!isControlsOpen)}
                />
            )}

            {/* Layer Controls Panel */}
            {isMobile && geoSets.length > 0 ? (
                <Drawer
                    open={isControlsOpen}
                    onOpenChange={setIsControlsOpen}
                    modal={false}
                    shouldScaleBackground={false}
                >
                    <DrawerContent hideOverlay className="max-h-[45vh] flex flex-col">
                        <DrawerTitle className="sr-only">Επιλέξτε Περιοχή</DrawerTitle>
                        <DrawerDescription className="sr-only">Επίπεδα χάρτη</DrawerDescription>
                        <LayerControlsPanel
                            variant="mobile"
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
                            currentUser={currentUser}
                            isEditingMode={isEditingMode}
                            selectedGeometryForEdit={selectedGeometryForEdit}
                            savedGeometries={savedGeometries}
                            regulationData={regulationData}
                            onToggleEditingMode={(enabled: boolean) => {
                                setIsEditingMode(enabled);
                                if (!enabled) {
                                    setSelectedGeometryForEdit(null);
                                    setSelectedLocations([]);
                                }
                            }}
                            onSelectGeometryForEdit={handleSelectGeometryForEdit}
                            onDeleteSavedGeometry={handleDeleteSavedGeometry}
                            cityData={cityData}
                            searchLocations={searchLocations}
                            onNavigateToSearchLocation={(location, index) => {
                                openSearchLocationDetail(location, index);
                                const pointGeometry: GeoJSON.Geometry = {
                                    type: 'Point',
                                    coordinates: location.coordinates
                                };
                                setZoomGeometry(pointGeometry);
                            }}
                            onSearchLocation={(location) => {
                                const newIndex = searchLocations.length;
                                setSearchLocations(prev => [...prev, location]);
                                openSearchLocationDetail(location, newIndex);
                                const pointGeometry: GeoJSON.Geometry = {
                                    type: 'Point',
                                    coordinates: location.coordinates
                                };
                                setZoomGeometry(pointGeometry);
                            }}
                            onRemoveSearchLocation={(index) => {
                                setSearchLocations(prev => prev.filter((_, i) => i !== index));
                                if (selectedSearchLocationIndex === index) {
                                    closeDetail();
                                } else if (selectedSearchLocationIndex !== null && selectedSearchLocationIndex > index) {
                                    setSelectedSearchLocationIndex(selectedSearchLocationIndex - 1);
                                }
                            }}
                            onShowInfo={onShowInfo}
                        />
                    </DrawerContent>
                </Drawer>
            ) : isControlsOpen && geoSets.length > 0 && (
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
                    currentUser={currentUser}
                    isEditingMode={isEditingMode}
                    selectedGeometryForEdit={selectedGeometryForEdit}
                    savedGeometries={savedGeometries}
                    regulationData={regulationData}
                    onToggleEditingMode={(enabled: boolean) => {
                        setIsEditingMode(enabled);
                        if (!enabled) {
                            setSelectedGeometryForEdit(null);
                            setSelectedLocations([]);
                        }
                    }}
                    onSelectGeometryForEdit={handleSelectGeometryForEdit}
                    onDeleteSavedGeometry={handleDeleteSavedGeometry}
                    cityData={cityData}
                    searchLocations={searchLocations}
                    onNavigateToSearchLocation={(location, index) => {
                        openSearchLocationDetail(location, index);
                        const pointGeometry: GeoJSON.Geometry = {
                            type: 'Point',
                            coordinates: location.coordinates
                        };
                        setZoomGeometry(pointGeometry);
                    }}
                    onSearchLocation={(location) => {
                        const newIndex = searchLocations.length;
                        setSearchLocations(prev => [...prev, location]);
                        openSearchLocationDetail(location, newIndex);
                        const pointGeometry: GeoJSON.Geometry = {
                            type: 'Point',
                            coordinates: location.coordinates
                        };
                        setZoomGeometry(pointGeometry);
                    }}
                    onRemoveSearchLocation={(index) => {
                        setSearchLocations(prev => prev.filter((_, i) => i !== index));
                        if (selectedSearchLocationIndex === index) {
                            closeDetail();
                        } else if (selectedSearchLocationIndex !== null && selectedSearchLocationIndex > index) {
                            setSelectedSearchLocationIndex(selectedSearchLocationIndex - 1);
                        }
                    }}
                    onShowInfo={onShowInfo}
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
                isEditingMode={isEditingMode}
                selectedGeometryForEdit={selectedGeometryForEdit}
                savedGeometries={savedGeometries}
                searchLocation={activeSearchLocation || undefined}
            />
        </div>
    );
} 