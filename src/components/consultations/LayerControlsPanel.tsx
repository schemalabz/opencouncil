"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Edit, Download, MapPin, MessageCircle, ChevronRight, TriangleAlert, Search, Info } from "lucide-react";
import GeoSetItem, { CheckboxState } from "./GeoSetItem";
import { RegulationData, CurrentUser, GeoSetData, SEARCH_COLORS } from './types';
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { CityWithGeometry } from '@/lib/db/cities';
import { LocationSelector } from "@/components/onboarding/selectors/LocationSelector";
import { Location } from "@/lib/types/onboarding";

interface LayerControlsPanelProps {
    geoSets: GeoSetData[];
    colors: string[];
    enabledGeometries: Set<string>;
    expandedGeoSets: Set<string>;
    activeCount: number;
    onClose: () => void;
    onToggleGeoSet: (id: string) => void;
    onToggleExpansion: (id: string) => void;
    onToggleGeometry: (id: string) => void;
    getGeoSetCheckboxState: (id: string) => CheckboxState;
    onOpenGeoSetDetail: (id: string) => void;
    onOpenGeometryDetail: (id: string) => void;
    contactEmail?: string;
    comments?: ConsultationCommentWithUpvotes[];
    consultationId?: string;
    cityId?: string;
    currentUser?: CurrentUser;
    isEditingMode?: boolean;
    selectedGeometryForEdit?: string | null;
    savedGeometries?: Record<string, any>;
    regulationData?: RegulationData | null;
    onToggleEditingMode?: (enabled: boolean) => void;
    onSelectGeometryForEdit?: (geometryId: string | null) => void;
    onDeleteSavedGeometry?: (geometryId: string) => void;
    cityData?: CityWithGeometry | null;
    onSearchLocation?: (location: Location) => void;
    onRemoveSearchLocation?: (index: number) => void;
    onNavigateToSearchLocation?: (location: Location, index: number) => void;
    searchLocations?: Location[];
    onShowInfo?: () => void;
}

export default function LayerControlsPanel({
    geoSets,
    colors,
    enabledGeometries,
    expandedGeoSets,
    activeCount,
    onClose,
    onToggleGeoSet,
    onToggleExpansion,
    onToggleGeometry,
    getGeoSetCheckboxState,
    onOpenGeoSetDetail,
    onOpenGeometryDetail,
    contactEmail,
    comments,
    consultationId,
    cityId,
    currentUser,
    isEditingMode,
    selectedGeometryForEdit,
    savedGeometries,
    regulationData,
    onToggleEditingMode,
    onSelectGeometryForEdit,
    onDeleteSavedGeometry,
    cityData,
    onSearchLocation,
    onRemoveSearchLocation,
    onNavigateToSearchLocation,
    searchLocations = [],
    onShowInfo
}: LayerControlsPanelProps) {

    const [showSearch, setShowSearch] = useState(false);

    // Use savedGeometries from props (now synced from ConsultationMap)
    const savedGeometriesData = savedGeometries || {};

    const containsInvalidGeoSets = geoSets.some(gs =>
        gs.geometries.length > 0 && gs.geometries.every((g: any) => !g.geojson && g.type !== 'derived')
    );

    // Count comments per geoset
    const getGeoSetCommentCount = (geoSetId: string) => {
        if (!comments) return 0;
        // Count direct geoset comments + geometry comments within this geoset
        const geoSet = geoSets.find(gs => gs.id === geoSetId);
        const geometryIds = geoSet?.geometries.map(g => g.id) || [];
        return comments.filter(c =>
            (c.entityType === 'GEOSET' && c.entityId === geoSetId) ||
            (c.entityType === 'GEOMETRY' && geometryIds.includes(c.entityId))
        ).length;
    };

    // Count point geometries (excluding boundary polygons)
    const getPointCount = (geoSet: GeoSetData) => {
        return geoSet.geometries.filter(g => g.type === 'point').length;
    };

    // Export function to merge original data with saved geometries
    const handleExportJSON = () => {
        try {
            if (!regulationData) {
                console.error('No regulation data available for export');
                return;
            }

            const exportData = JSON.parse(JSON.stringify(regulationData));

            exportData.regulation.forEach((item: any) => {
                if (item.type === 'geoset' && item.geometries) {
                    item.geometries.forEach((geometry: any) => {
                        if (savedGeometriesData[geometry.id]) {
                            geometry.geojson = savedGeometriesData[geometry.id];
                        }
                    });
                }
            });

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `regulation-with-geometries-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting regulation JSON:', error);
        }
    };

    // Editing mode: show the full detailed layer controls
    if (isEditingMode) {
        return (
            <div className="absolute top-16 left-4 right-4 md:right-auto md:top-4 w-auto md:w-96 max-h-[calc(100vh-8rem)] shadow-lg z-20 bg-white/95 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col">
                <div className="p-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-sm">Επίπεδα Χάρτη</h3>
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>

                    {currentUser?.isSuperAdmin && onToggleEditingMode && (
                        <div className="mb-4">
                            <Button
                                onClick={() => onToggleEditingMode(false)}
                                variant="default"
                                size="sm"
                                className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                            >
                                <Edit className="h-3 w-3" />
                                Τέλος Επεξεργασίας
                            </Button>

                            <div className="mt-3">
                                <Button
                                    onClick={handleExportJSON}
                                    variant="secondary"
                                    size="sm"
                                    className="w-full gap-2 text-xs"
                                >
                                    <Download className="h-3 w-3" />
                                    Εξαγωγή Regulation.json ({Object.keys(savedGeometriesData).length} νέες γεωμετρίες)
                                </Button>

                                {!selectedGeometryForEdit && (
                                    <div className="text-center py-3 mt-3 text-xs text-muted-foreground bg-muted/50 rounded-md">
                                        <div className="font-medium mb-1">Επιλέξτε γεωμετρία για επεξεργασία</div>
                                        <div>Κάντε κλικ στο κουμπί επεξεργασίας δίπλα σε μια γεωμετρία</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className="flex-1 px-4 overflow-y-auto overscroll-contain space-y-3"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {geoSets.map((geoSet, geoSetIndex) => {
                        const color = geoSet.color || colors[geoSetIndex % colors.length];
                        const checkboxState = getGeoSetCheckboxState(geoSet.id);
                        const isExpanded = expandedGeoSets.has(geoSet.id);

                        const hasInvalidGeometries = geoSet.geometries.length > 0 && geoSet.geometries.every(
                            (g: any) => !g.geojson && g.type !== 'derived'
                        );

                        return (
                            <GeoSetItem
                                key={geoSet.id}
                                id={geoSet.id}
                                name={geoSet.name}
                                description={geoSet.description}
                                color={color}
                                checkboxState={checkboxState}
                                isExpanded={isExpanded}
                                geometries={geoSet.geometries}
                                enabledGeometries={enabledGeometries}
                                onToggleGeoSet={onToggleGeoSet}
                                onToggleExpansion={onToggleExpansion}
                                onToggleGeometry={onToggleGeometry}
                                onOpenGeoSetDetail={onOpenGeoSetDetail}
                                onOpenGeometryDetail={onOpenGeometryDetail}
                                contactEmail={contactEmail}
                                comments={comments}
                                consultationId={consultationId}
                                cityId={cityId}
                                hasInvalidGeometries={hasInvalidGeometries}
                                isEditingMode={isEditingMode}
                                selectedGeometryForEdit={selectedGeometryForEdit}
                                savedGeometries={savedGeometriesData}
                                onSelectGeometryForEdit={onSelectGeometryForEdit}
                                onDeleteSavedGeometry={onDeleteSavedGeometry}
                            />
                        );
                    })}
                </div>

                <div className="p-4 pt-3 border-t flex-shrink-0">
                    <div className="text-xs text-muted-foreground">
                        Σύνολο: {activeCount} στοιχεία ενεργά
                    </div>
                </div>
            </div>
        );
    }

    // Normal mode: simplified community picker
    return (
        <div className="absolute top-16 left-4 right-4 md:right-auto md:top-4 w-auto md:w-80 max-h-[calc(100vh-8rem)] shadow-lg z-20 bg-white/95 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 pb-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Επιλέξτε Περιοχή</h3>
                    <div className="flex items-center gap-1">
                        {onShowInfo && (
                            <Button
                                onClick={onShowInfo}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                title="Πληροφορίες διαβούλευσης"
                            >
                                <Info className="h-3 w-3" />
                            </Button>
                        )}
                        {currentUser?.isSuperAdmin && onToggleEditingMode && (
                            <Button
                                onClick={() => onToggleEditingMode(true)}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                title="Λειτουργία Επεξεργασίας"
                            >
                                <Edit className="h-3 w-3" />
                            </Button>
                        )}
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Address search */}
                {cityData && (showSearch || searchLocations.length > 0) ? (
                    <div className="mb-2">
                        <LocationSelector
                            selectedLocations={searchLocations}
                            onSelect={(location) => onSearchLocation?.(location)}
                            onRemove={(index) => onRemoveSearchLocation?.(index)}
                            city={cityData}
                            hideSelectedList
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowSearch(true)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 mb-2 text-sm text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-md transition-colors text-left"
                    >
                        <Search className="h-4 w-4 shrink-0" />
                        <span>Αναζήτηση διεύθυνσης...</span>
                    </button>
                )}

                {containsInvalidGeoSets && (
                    <div className="mb-2 p-2 bg-yellow-100/50 border border-yellow-200/50 rounded-md text-xs text-yellow-800 flex items-start gap-2">
                        <TriangleAlert className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <span>Ορισμένες περιοχές ενδέχεται να μην είναι ακόμα ορατές στον χάρτη.</span>
                    </div>
                )}
            </div>

            <div
                className="flex-1 px-4 pb-4 overflow-y-auto overscroll-contain space-y-1.5"
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Selected search locations */}
                {searchLocations.length > 0 && (
                    <div className="space-y-1 pb-2 mb-1 border-b">
                        <div className="text-xs font-medium text-muted-foreground px-1">
                            Οι τοποθεσίες σας
                        </div>
                        {searchLocations.map((location, index) => {
                            const pinColor = SEARCH_COLORS[index % SEARCH_COLORS.length];
                            return (
                                <div
                                    key={`search-${index}`}
                                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 transition-colors group"
                                >
                                    <button
                                        onClick={() => onNavigateToSearchLocation?.(location, index)}
                                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                    >
                                        <MapPin
                                            className="h-3.5 w-3.5 shrink-0"
                                            style={{ color: pinColor }}
                                        />
                                        <span className="text-sm truncate">{location.text}</span>
                                    </button>
                                    <button
                                        onClick={() => onRemoveSearchLocation?.(index)}
                                        className="h-5 w-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-muted transition-all shrink-0"
                                    >
                                        <X className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {geoSets.map((geoSet, geoSetIndex) => {
                    const color = geoSet.color || colors[geoSetIndex % colors.length];
                    const pointCount = getPointCount(geoSet);
                    const commentCount = getGeoSetCommentCount(geoSet.id);

                    return (
                        <button
                            key={geoSet.id}
                            onClick={() => onOpenGeoSetDetail(geoSet.id)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left group"
                        >
                            <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: color, boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}` }}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium leading-tight">
                                    {geoSet.name}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    {pointCount} προτεινόμενες θέσεις
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {commentCount > 0 && (
                                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                        <MessageCircle className="h-3 w-3" />
                                        {commentCount}
                                    </span>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
