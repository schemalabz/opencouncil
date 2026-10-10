"use client";

import { Button } from "@/components/ui/button";
import { X, Edit, Download } from "lucide-react";
import GeoSetItem, { CheckboxState } from "./GeoSetItem";
import { RegulationData, GeoSetData } from './types';

/**
 * The superadmin geo-editor's layer list: every geoset and geometry with visibility checkboxes,
 * a button to pick a geometry for drawing, and the export of the regulation with the drawn
 * geometries. Readers never see it; their map shows a legend instead.
 */
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
    selectedGeometryForEdit?: string | null;
    savedGeometries?: Record<string, GeoJSON.Geometry>;
    regulationData?: RegulationData | null;
    onSelectGeometryForEdit?: (geometryId: string | null) => void;
    onDeleteSavedGeometry?: (geometryId: string) => void;
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
    selectedGeometryForEdit,
    savedGeometries = {},
    regulationData,
    onSelectGeometryForEdit,
    onDeleteSavedGeometry,
}: LayerControlsPanelProps) {
    // Export function to merge original data with saved geometries
    const handleExportJSON = () => {
        try {
            if (!regulationData) {
                console.error('No regulation data available for export');
                return;
            }

            const exportData: RegulationData = JSON.parse(JSON.stringify(regulationData));
            exportData.regulation.forEach((item) => {
                if (item.type === 'geoset' && item.geometries) {
                    item.geometries.forEach((geometry) => {
                        const saved = savedGeometries[geometry.id];
                        if (saved && geometry.type !== 'derived') {
                            (geometry as { geojson: GeoJSON.Geometry }).geojson = saved;
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

    return (
        <div className="absolute top-16 left-4 right-4 md:right-auto md:top-4 w-auto md:w-96 max-h-[calc(100vh-8rem)] shadow-lg z-20 bg-white/95 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">Επίπεδα Χάρτη</h3>
                    <Button onClick={onClose} variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Κλείσιμο">
                        <X className="h-3 w-3" />
                    </Button>
                </div>

                <div className="mb-4">
                    <Button onClick={onClose} variant="default" size="sm" className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                        <Edit className="h-3 w-3" />
                        Τέλος Επεξεργασίας
                    </Button>

                    <div className="mt-3">
                        <Button onClick={handleExportJSON} variant="secondary" size="sm" className="w-full gap-2 text-xs">
                            <Download className="h-3 w-3" />
                            Εξαγωγή Regulation.json ({Object.keys(savedGeometries).length} νέες γεωμετρίες)
                        </Button>

                        {!selectedGeometryForEdit && (
                            <div className="text-center py-3 mt-3 text-xs text-muted-foreground bg-muted/50 rounded-md">
                                <div className="font-medium mb-1">Επιλέξτε γεωμετρία για επεξεργασία</div>
                                <div>Κάντε κλικ στο κουμπί επεξεργασίας δίπλα σε μια γεωμετρία</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 px-4 overflow-y-auto overscroll-contain space-y-3" onWheel={(e) => e.stopPropagation()}>
                {geoSets.map((geoSet, geoSetIndex) => {
                    const color = geoSet.color || colors[geoSetIndex % colors.length];
                    const hasInvalidGeometries = geoSet.geometries.length > 0 && geoSet.geometries.every(
                        (g) => g.type !== 'derived' && !('geojson' in g && g.geojson)
                    );

                    return (
                        <GeoSetItem
                            key={geoSet.id}
                            id={geoSet.id}
                            name={geoSet.name}
                            description={geoSet.description}
                            color={color}
                            checkboxState={getGeoSetCheckboxState(geoSet.id)}
                            isExpanded={expandedGeoSets.has(geoSet.id)}
                            geometries={geoSet.geometries}
                            enabledGeometries={enabledGeometries}
                            onToggleGeoSet={onToggleGeoSet}
                            onToggleExpansion={onToggleExpansion}
                            onToggleGeometry={onToggleGeometry}
                            onOpenGeoSetDetail={onOpenGeoSetDetail}
                            onOpenGeometryDetail={onOpenGeometryDetail}
                            hasInvalidGeometries={hasInvalidGeometries}
                            isEditingMode
                            selectedGeometryForEdit={selectedGeometryForEdit}
                            savedGeometries={savedGeometries}
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
