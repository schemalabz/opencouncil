import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import GeoSetItem, { CheckboxState } from "./GeoSetItem";
import { Geometry } from "./types";

interface GeoSetData {
    id: string;
    name: string;
    description?: string;
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
    getGeoSetCheckboxState
}: LayerControlsPanelProps) {
    return (
        <div className="absolute top-16 left-4 right-4 md:right-auto md:top-4 w-auto md:w-96 max-h-[calc(100vh-6rem)] shadow-lg z-20 bg-white/95 backdrop-blur-sm rounded-lg">
            <div className="p-4">
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

                <div className="space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {geoSets.map((geoSet, geoSetIndex) => {
                        const color = colors[geoSetIndex % colors.length];
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
                            />
                        );
                    })}
                </div>

                <div className="mt-4 pt-3 border-t">
                    <div className="text-xs text-muted-foreground">
                        Σύνολο: {activeCount} στοιχεία ενεργά
                    </div>
                </div>
            </div>
        </div>
    );
} 