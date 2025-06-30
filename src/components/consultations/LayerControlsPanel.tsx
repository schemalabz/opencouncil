import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import GeoSetItem, { CheckboxState } from "./GeoSetItem";
import { Geometry, RegulationData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface GeoSetData {
    id: string;
    name: string;
    description?: string;
    color?: string;
    geometries: Geometry[];
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
    regulationData?: RegulationData;
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
    regulationData
}: LayerControlsPanelProps) {
    // Sort geoSets so that default visible ones appear first
    const sortedGeoSets = [...geoSets].sort((a, b) => {
        const defaultVisible = regulationData?.defaultVisibleGeosets || [];
        const aIsDefault = defaultVisible.includes(a.id);
        const bIsDefault = defaultVisible.includes(b.id);

        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        return 0; // Keep original order for items in the same category
    });

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
            </div>

            <div
                className="flex-1 px-4 overflow-y-auto overscroll-contain space-y-3"
                onWheel={(e) => e.stopPropagation()}
            >
                {sortedGeoSets.map((geoSet, geoSetIndex) => {
                    // Use geoset's own color if available, otherwise fall back to colors array
                    // Note: we need to find the original index for color assignment
                    const originalIndex = geoSets.findIndex(gs => gs.id === geoSet.id);
                    const color = geoSet.color || colors[originalIndex % colors.length];
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