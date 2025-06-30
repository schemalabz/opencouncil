import { Button } from "@/components/ui/button";
import { X, Edit, Download, ChevronDown, ChevronUp } from "lucide-react";
import GeoSetItem, { CheckboxState } from "./GeoSetItem";
import { Geometry } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { RegulationData } from './types';
import { CityWithGeometry } from '@/lib/db/cities';

interface GeoSetData {
    id: string;
    name: string;
    description?: string;
    color?: string;
    geometries: Geometry[];
}

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    isSuperAdmin?: boolean;
}

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
    onDeleteSavedGeometry
}: LayerControlsPanelProps) {
    
    // Use savedGeometries from props (now synced from ConsultationMap)
    const savedGeometriesData = savedGeometries || {};
    
    // Export function to merge original data with saved geometries
    const handleExportJSON = () => {
        try {
            if (!regulationData) {
                console.error('No regulation data available for export');
                return;
            }
            
            // Create a deep copy of the complete regulation data
            const exportData = JSON.parse(JSON.stringify(regulationData));
            
            // Merge in the saved geometries by updating the regulation items
            exportData.regulation.forEach((item: any) => {
                if (item.type === 'geoset' && item.geometries) {
                    item.geometries.forEach((geometry: any) => {
                        if (savedGeometriesData[geometry.id]) {
                            geometry.geojson = savedGeometriesData[geometry.id];
                        }
                    });
                }
            });
            
            // Create downloadable file with a more descriptive name
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `regulation-with-geometries-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('📥 Exported complete regulation JSON with merged geometries:', exportData);
        } catch (error) {
            console.error('Error exporting regulation JSON:', error);
        }
    };

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
                
                {/* Editing Mode Toggle - Only for super admins */}
                {currentUser?.isSuperAdmin && onToggleEditingMode && (
                    <div className="mb-4">
                        <Button
                            onClick={() => onToggleEditingMode(!isEditingMode)}
                            variant={isEditingMode ? "default" : "outline"}
                            size="sm"
                            className={`w-full gap-2 ${isEditingMode ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                        >
                            <Edit className="h-3 w-3" />
                            {isEditingMode ? 'Τέλος Επεξεργασίας' : 'Λειτουργία Επεξεργασίας'}
                        </Button>
                        
                        {/* Editing Controls - Only visible when editing */}
                        {isEditingMode && (
                            <div className="mt-3">
                                {/* Export Button */}
                                <Button
                                    onClick={handleExportJSON}
                                    variant="secondary"
                                    size="sm"
                                    className="w-full gap-2 text-xs"
                                >
                                    <Download className="h-3 w-3" />
                                    Εξαγωγή Regulation.json ({Object.keys(savedGeometriesData).length} νέες γεωμετρίες)
                                </Button>

                                {/* Message when no geometry selected */}
                                {!selectedGeometryForEdit && (
                                    <div className="text-center py-3 mt-3 text-xs text-muted-foreground bg-muted/50 rounded-md">
                                        <div className="font-medium mb-1">Επιλέξτε γεωμετρία για επεξεργασία</div>
                                        <div>Κάντε κλικ στο κουμπί επεξεργασίας δίπλα σε μια γεωμετρία</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div
                className="flex-1 px-4 overflow-y-auto overscroll-contain space-y-3"
                onWheel={(e) => e.stopPropagation()}
            >
                {geoSets.map((geoSet, geoSetIndex) => {
                    // Use geoset's own color if available, otherwise fall back to colors array
                    const color = geoSet.color || colors[geoSetIndex % colors.length];
                    const checkboxState = getGeoSetCheckboxState(geoSet.id);
                    const isExpanded = expandedGeoSets.has(geoSet.id);

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