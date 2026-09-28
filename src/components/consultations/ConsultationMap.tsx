"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Pencil, Search } from "lucide-react";
import Map, { MapFeature } from "@/components/map/map";
import { cn } from "@/lib/utils";
import { RegulationData, StaticGeometry, CurrentUser, GeoSetData } from "./types";
import LayerControlsPanel from "./LayerControlsPanel";
import { computeDerivedGeometry } from "./derivedGeometry";
import EditingToolsPanel from "./EditingToolsPanel";
import AddressSearchBar from "./views/AddressSearchBar";
import { CheckboxState } from "./GeoSetItem";
import { CityWithGeometry } from "@/lib/db/cities";
import { Location } from "@/lib/types/onboarding";

interface ConsultationMapProps {
    className?: string;
    regulationData: RegulationData | null;
    geoSets: GeoSetData[];
    /** The place the reader has open; the viewer owns it (it lives in the URL). */
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** The reader's address, drawn as a pin; the map zooms to it and the highlighted places when it changes. */
    address: Location | null;
    /** Places to outline, e.g. the street sides at the reader's address. */
    highlightIds: Set<string>;
    onAddressClick?: () => void;
    /** Sets the reader's address from the map's search bar; without it there is no search bar (the regulation has no address lookup). */
    onAddress?: (location: Location) => void;
    currentUser?: CurrentUser;
    cityData: CityWithGeometry | null;
    /** Height in px of an overlay covering the bottom of the map (the phone's place card); zooms keep clear of it. */
    bottomInset?: number;
    /** Drawn before the search pill, e.g. the phone's back button. */
    leading?: ReactNode;
    /** Overlays drawn over the map, e.g. the phone's place card. */
    children?: ReactNode;
}

// Generate distinct colors for different geosets
const GEOSET_COLORS = [
    '#627BBC', // Primary blue
    '#E57373', // Red
    '#81C784', // Green
    '#FFB74D', // Orange
    '#BA68C8', // Purple
    '#4FC3F7', // Light blue
    '#F06292', // Pink
    '#AED581', // Light green
    '#FFD54F', // Yellow
    '#90A4AE'  // Blue grey
];

const SELECTED_STROKE = '#111827';
const SAVED_GEOMETRIES_KEY = 'opencouncil-edited-geometries';

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
    geoSets,
    selectedId,
    onSelect,
    address,
    highlightIds,
    onAddressClick,
    onAddress,
    currentUser,
    cityData,
    bottomInset = 0,
    leading,
    children
}: ConsultationMapProps) {
    const [enabledGeoSets, setEnabledGeoSets] = useState<Set<string>>(new Set());
    const [enabledGeometries, setEnabledGeometries] = useState<Set<string>>(new Set());
    const [expandedGeoSets, setExpandedGeoSets] = useState<Set<string>>(new Set());

    // Editing state (superadmins only): the geo-editor for drawing geometries a regulation lacks
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [drawingMode, setDrawingMode] = useState<'point' | 'polygon'>('point');
    const [selectedGeometryForEdit, setSelectedGeometryForEdit] = useState<string | null>(null);
    const [savedGeometries, setSavedGeometries] = useState<Record<string, GeoJSON.Geometry>>({});
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

    const [zoomGeometry, setZoomGeometry] = useState<GeoJSON.Geometry | null>(null);
    // A place the reader clicked on the map is already in view: its selection must not move the camera.
    const clickedIdRef = useRef<string | null>(null);
    const didInitialFit = useRef(false);

    // Load saved geometries from localStorage on mount; other tabs and the editor notify changes
    useEffect(() => {
        const loadSavedGeometries = () => {
            try {
                const saved = JSON.parse(localStorage.getItem(SAVED_GEOMETRIES_KEY) || '{}');
                setSavedGeometries(prev => JSON.stringify(prev) !== JSON.stringify(saved) ? saved : prev);
            } catch (error) {
                console.error('Error loading saved geometries:', error);
                setSavedGeometries({});
            }
        };
        loadSavedGeometries();
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === SAVED_GEOMETRIES_KEY) loadSavedGeometries();
        };
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('opencouncil-storage-change', loadSavedGeometries);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('opencouncil-storage-change', loadSavedGeometries);
        };
    }, []);

    // Every geoset starts visible, or only those the regulation lists as visible by default.
    useEffect(() => {
        const defaults = regulationData?.defaultVisibleGeosets;
        const visible = defaults?.length ? geoSets.filter(gs => defaults.includes(gs.id)) : geoSets;
        setEnabledGeoSets(new Set(visible.map(gs => gs.id)));
        setEnabledGeometries(new Set(visible.flatMap(gs => gs.geometries.map(g => g.id))));
        setExpandedGeoSets(new Set());
    }, [geoSets, regulationData?.defaultVisibleGeosets]);

    // Find the zoomable GeoJSON for a geometry (or a whole geoset) by id
    const findGeoJSON = useCallback((id: string): GeoJSON.Geometry | null => {
        const geoSet = geoSets.find(gs => gs.id === id);
        if (geoSet) {
            const geometries = geoSet.geometries
                .map(g => savedGeometries[g.id] ?? (g.type !== 'derived' && 'geojson' in g ? g.geojson : null))
                .filter((g): g is StaticGeometry['geojson'] => !!g);
            return geometries.length ? { type: 'GeometryCollection', geometries } : null;
        }
        const geometry = geoSets.flatMap(gs => gs.geometries).find(g => g.id === id);
        if (!geometry) return null;
        if (savedGeometries[geometry.id]) return savedGeometries[geometry.id];
        if (geometry.type !== 'derived' && 'geojson' in geometry && geometry.geojson) return geometry.geojson;
        if (geometry.type === 'derived') return computeDerivedGeometry(geometry, geoSets);
        return null;
    }, [geoSets, savedGeometries]);

    const handleMapFeatureClick = (feature: GeoJSON.Feature) => {
        if (feature.properties?.type === 'search-location') {
            onAddressClick?.();
            return;
        }
        const id = feature.properties?.id;
        if (typeof id !== 'string' || feature.properties?.type === 'location-point') return;
        clickedIdRef.current = id;
        onSelect(id);
    };

    // Map registers its click listener once, so hand it a stable callback that reads the latest handler.
    const mapFeatureClickRef = useRef(handleMapFeatureClick);
    mapFeatureClickRef.current = handleMapFeatureClick;
    const onMapFeatureClick = useCallback((feature: GeoJSON.Feature) => mapFeatureClickRef.current(feature), []);

    const mapFeatures: MapFeature[] = useMemo(() => {
        const features: MapFeature[] = [];

        geoSets.forEach((geoSet, geoSetIndex) => {
            if (!enabledGeoSets.has(geoSet.id)) return;
            const color = geoSet.color || GEOSET_COLORS[geoSetIndex % GEOSET_COLORS.length];
            const mapStyle = geoSet.mapStyle;

            geoSet.geometries.forEach(geometry => {
                if (!enabledGeometries.has(geometry.id)) return;

                const isFromLocalStorage = !!savedGeometries[geometry.id];
                const geoJSON: GeoJSON.Geometry | null = isFromLocalStorage
                    ? savedGeometries[geometry.id]
                    : geometry.type === 'derived'
                        ? computeDerivedGeometry(geometry, geoSets)
                        : ('geojson' in geometry && geometry.geojson) || null;
                if (!geoJSON) return;

                const isPoint = geometry.type === 'point';
                const label = mapStyle?.showLabels === false
                    ? ''
                    : (isPoint && geometry.textualDefinition) ? geometry.textualDefinition : geometry.name;
                const fillOpacity = geometry.type === 'derived' ? 0.15 : (isFromLocalStorage ? 0.5 : (mapStyle?.fillOpacity ?? 0.4));
                const strokeWidth = geometry.type === 'derived'
                    ? 0
                    : isPoint
                        ? (mapStyle?.strokeWidth ?? 4)
                        : (isFromLocalStorage ? 3 : (mapStyle?.strokeWidth ?? 2));
                // The open place stands out most; the places at the reader's address are outlined.
                const isSelected = geometry.id === selectedId;
                const isHighlighted = highlightIds.has(geometry.id);

                features.push({
                    id: geometry.id,
                    geometry: geoJSON,
                    properties: {
                        geoSetId: geoSet.id,
                        geoSetName: geoSet.name,
                        name: geometry.name,
                        description: geometry.description,
                        isDerived: geometry.type === 'derived',
                        isFromLocalStorage,
                        ...(mapStyle?.hover === false ? { hover: false } : {})
                    },
                    style: {
                        fillColor: isFromLocalStorage ? '#3B82F6' : color,
                        // A faint area (a zone) stays faint when selected: filled in, it would hide the streets.
                        fillOpacity: isSelected || isHighlighted
                            ? (fillOpacity < 0.2 ? fillOpacity + 0.06 : Math.min(1, fillOpacity + 0.3))
                            : fillOpacity,
                        strokeColor: geometry.type === 'derived'
                            ? 'transparent'
                            : (isSelected || isHighlighted) && !isPoint ? SELECTED_STROKE : (isFromLocalStorage ? '#1D4ED8' : color),
                        strokeWidth: isPoint
                            ? (isSelected ? strokeWidth + 3 : strokeWidth)
                            : isSelected ? 5 : isHighlighted ? 3 : strokeWidth,
                        label
                    }
                });
            });
        });

        if (isEditingMode && selectedLocations.length > 0) {
            features.push(...createLocationLineFeatures(selectedLocations));
        }

        if (address && !isEditingMode) {
            features.push({
                id: 'search-location',
                geometry: { type: 'Point', coordinates: address.coordinates },
                properties: { type: 'search-location', name: address.text, alwaysShowLabel: true },
                style: { fillColor: '#C2410C', fillOpacity: 0.95, strokeColor: '#ffffff', strokeWidth: 10, label: address.text }
            });
        }

        return features;
    }, [geoSets, enabledGeoSets, enabledGeometries, savedGeometries, isEditingMode, selectedLocations, address, selectedId, highlightIds]);

    // Camera: the whole plan first; the reader's address and its street when it changes; a place
    // opened from a list or a link. Declared in that order so a selected place wins on first load.
    useEffect(() => {
        if (didInitialFit.current || mapFeatures.length === 0) return;
        didInitialFit.current = true;
        if (selectedId || address) return;
        setZoomGeometry({ type: 'GeometryCollection', geometries: mapFeatures.map(f => f.geometry) });
    }, [mapFeatures, selectedId, address]);

    useEffect(() => {
        if (!address) return;
        const street = [...highlightIds].map(id => findGeoJSON(id)).filter((g): g is GeoJSON.Geometry => !!g);
        setZoomGeometry({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: address.coordinates }, ...street] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-zoom only when the address itself changes
    }, [address]);

    useEffect(() => {
        if (!selectedId) return;
        if (clickedIdRef.current === selectedId) {
            clickedIdRef.current = null;
            return;
        }
        const geoJSON = findGeoJSON(selectedId);
        if (geoJSON) setZoomGeometry(geoJSON);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom when the selection changes, not when geometries reload
    }, [selectedId]);

    // Zooms keep clear of the search pill and legend at the top and of a card at the bottom.
    // Memoised: Map re-fits whenever this object's identity changes.
    const zoomPadding = useMemo(
        () => ({ top: 130, bottom: bottomInset + 24, left: 24, right: 24 }),
        [bottomInset]
    );

    // Editing: layer checkboxes and the geometry editor
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
        const enable = getGeoSetCheckboxState(geoSetId) !== 'checked';
        setEnabledGeoSets(prev => {
            const next = new Set(prev);
            if (enable) next.add(geoSetId); else next.delete(geoSetId);
            return next;
        });
        setEnabledGeometries(prev => {
            const next = new Set(prev);
            geoSet.geometries.forEach(g => { if (enable) next.add(g.id); else next.delete(g.id); });
            return next;
        });
    };

    const toggleGeometry = (geometryId: string) => {
        const parentGeoSet = geoSets.find(gs => gs.geometries.some(g => g.id === geometryId));
        const next = new Set(enabledGeometries);
        if (next.has(geometryId)) next.delete(geometryId); else next.add(geometryId);
        setEnabledGeometries(next);
        if (parentGeoSet) {
            setEnabledGeoSets(prev => {
                const geoSetsNext = new Set(prev);
                if (parentGeoSet.geometries.some(g => next.has(g.id))) geoSetsNext.add(parentGeoSet.id);
                else geoSetsNext.delete(parentGeoSet.id);
                return geoSetsNext;
            });
        }
    };

    const toggleGeoSetExpansion = (geoSetId: string) => {
        setExpandedGeoSets(prev => {
            const next = new Set(prev);
            if (next.has(geoSetId)) next.delete(geoSetId); else next.add(geoSetId);
            return next;
        });
    };

    const handleSelectGeometryForEdit = (geometryId: string | null) => {
        setSelectedGeometryForEdit(geometryId);
        if (geometryId) {
            const geoJSON = findGeoJSON(geometryId);
            if (geoJSON) setZoomGeometry(geoJSON);
        }
    };

    const handleSelectedLocationsChange = useCallback((locations: Location[]) => {
        setSelectedLocations(locations);
    }, []);

    const writeSavedGeometries = (next: Record<string, GeoJSON.Geometry>) => {
        localStorage.setItem(SAVED_GEOMETRIES_KEY, JSON.stringify(next));
        setSavedGeometries({ ...next });
        window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));
    };

    const handleApplyLocationToGeometry = (coordinates: [number, number]) => {
        if (!selectedGeometryForEdit) return;
        try {
            const saved = JSON.parse(localStorage.getItem(SAVED_GEOMETRIES_KEY) || '{}');
            saved[selectedGeometryForEdit] = { type: 'Point', coordinates };
            writeSavedGeometries(saved);
        } catch (error) {
            console.error('Error applying location to geometry:', error);
        }
    };

    const handleDeleteSavedGeometry = (geometryId: string) => {
        try {
            const saved = JSON.parse(localStorage.getItem(SAVED_GEOMETRIES_KEY) || '{}');
            delete saved[geometryId];
            writeSavedGeometries(saved);
            if (selectedGeometryForEdit === geometryId) setSelectedGeometryForEdit(null);
        } catch (error) {
            console.error('Error deleting saved geometry:', error);
        }
    };

    // One filter chip per labelled geoset; it also shows and hides the unlabelled geosets of its
    // colour (the dedicated ΑΜΕΑ spots go with "ΑΜΕΑ"). Unlabelled geosets of another colour, such
    // as the zones, always stay on. A regulation without labels gets a chip per geoset, by name.
    const geoSetColor = (gs: GeoSetData) => gs.color || GEOSET_COLORS[geoSets.indexOf(gs) % GEOSET_COLORS.length];
    const labelled = geoSets.filter(gs => gs.legend);
    const filters = labelled.length > 0
        ? labelled.map(gs => ({
            id: gs.id,
            label: gs.legend ?? gs.name,
            color: geoSetColor(gs),
            members: [gs.id, ...geoSets.filter(other => !other.legend && other.color === gs.color).map(other => other.id)],
        }))
        : geoSets.filter(gs => gs.geometries.length > 0).map(gs => ({ id: gs.id, label: gs.name, color: geoSetColor(gs), members: [gs.id] }));

    const toggleFilter = (members: string[]) => {
        const show = !members.every(id => enabledGeoSets.has(id));
        const memberGeoSets = geoSets.filter(gs => members.includes(gs.id));
        setEnabledGeoSets(prev => {
            const next = new Set(prev);
            members.forEach(id => { if (show) next.add(id); else next.delete(id); });
            return next;
        });
        setEnabledGeometries(prev => {
            const next = new Set(prev);
            memberGeoSets.forEach(gs => gs.geometries.forEach(g => { if (show) next.add(g.id); else next.delete(g.id); }));
            return next;
        });
    };

    return (
        <div className={cn("relative", className)}>
            <Map
                center={[23.7275, 37.9755]} // Athens fallback
                zoom={12}
                pitch={0}
                animateRotation={false}
                features={mapFeatures}
                onFeatureClick={onMapFeatureClick}
                className="w-full h-full"
                editingMode={isEditingMode}
                showStreetLabels={true}
                drawingMode={drawingMode}
                selectedGeometryForEdit={selectedGeometryForEdit}
                zoomToGeometry={zoomGeometry}
                zoomPadding={zoomPadding}
            />

            {!isEditingMode && (
                // Spans the map's width; only its controls take clicks, so the map stays clickable around them.
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 pt-3">
                    <div className="flex items-center gap-2 px-3 [&>*]:pointer-events-auto">
                        {leading}
                        {onAddress && (cityData ? (
                            <AddressSearchBar city={cityData} address={address} onAddress={onAddress} />
                        ) : (
                            <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-white px-4 text-base text-stone-500 shadow-md">
                                <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
                                Βρείτε τον δρόμο σας
                            </div>
                        ))}
                        {currentUser?.isSuperAdmin && (
                            <button
                                type="button"
                                onClick={() => setIsEditingMode(true)}
                                aria-label="Επεξεργασία γεωμετριών"
                                title="Επεξεργασία γεωμετριών"
                                className="ml-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-stone-700 shadow-md"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    {filters.length > 0 && (
                        <ul className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Τι δείχνει ο χάρτης">
                            {filters.map(filter => {
                                const on = filter.members.every(id => enabledGeoSets.has(id));
                                return (
                                    <li key={filter.id} className="pointer-events-auto min-w-fit flex-1">
                                        <button
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => toggleFilter(filter.members)}
                                            title={on ? `Απόκρυψη: ${filter.label}` : `Εμφάνιση: ${filter.label}`}
                                            className={cn(
                                                "inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold shadow-sm transition-colors",
                                                on ? "bg-white text-stone-900" : "bg-white/70 text-stone-500 line-through decoration-stone-400"
                                            )}
                                        >
                                            <span
                                                className="h-3 w-3 rounded-full border-2"
                                                style={{ backgroundColor: on ? filter.color : 'transparent', borderColor: filter.color }}
                                                aria-hidden="true"
                                            />
                                            {filter.label}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {isEditingMode && (
                <LayerControlsPanel
                    geoSets={geoSets}
                    colors={GEOSET_COLORS}
                    enabledGeometries={enabledGeometries}
                    expandedGeoSets={expandedGeoSets}
                    activeCount={mapFeatures.length}
                    onClose={() => {
                        setIsEditingMode(false);
                        setSelectedGeometryForEdit(null);
                        setSelectedLocations([]);
                    }}
                    onToggleGeoSet={toggleGeoSet}
                    onToggleExpansion={toggleGeoSetExpansion}
                    onToggleGeometry={toggleGeometry}
                    getGeoSetCheckboxState={getGeoSetCheckboxState}
                    onOpenGeoSetDetail={onSelect}
                    onOpenGeometryDetail={onSelect}
                    selectedGeometryForEdit={selectedGeometryForEdit}
                    savedGeometries={savedGeometries}
                    regulationData={regulationData}
                    onSelectGeometryForEdit={handleSelectGeometryForEdit}
                    onDeleteSavedGeometry={handleDeleteSavedGeometry}
                />
            )}

            {isEditingMode && selectedGeometryForEdit && (
                <EditingToolsPanel
                    selectedGeometryForEdit={selectedGeometryForEdit}
                    selectedGeometry={geoSets.flatMap(gs => gs.geometries).find(g => g.id === selectedGeometryForEdit)}
                    drawingMode={drawingMode}
                    cityData={cityData}
                    onSetDrawingMode={setDrawingMode}
                    onNavigateToLocation={(coordinates) => setZoomGeometry({ type: 'Point', coordinates })}
                    onSelectedLocationsChange={handleSelectedLocationsChange}
                    onApplyLocationToGeometry={handleApplyLocationToGeometry}
                    onClose={() => handleSelectGeometryForEdit(null)}
                />
            )}

            {!isEditingMode && children}
        </div>
    );
}
