import { Button } from "@/components/ui/button";
import { X, MapPin, Pentagon } from "lucide-react";
import { LocationNavigator } from './LocationNavigator';
import { CityWithGeometry } from '@/lib/db/cities';
import { Geometry } from "./types";

type DrawingMode = 'point' | 'polygon';

interface EditingToolsPanelProps {
    selectedGeometryForEdit: string;
    selectedGeometry: Geometry | undefined;
    drawingMode: DrawingMode;
    cityData: CityWithGeometry | null;
    onSetDrawingMode: (mode: DrawingMode) => void;
    onNavigateToLocation: (coordinates: [number, number]) => void;
    onClose: () => void;
}

export default function EditingToolsPanel({
    selectedGeometryForEdit,
    selectedGeometry,
    drawingMode,
    cityData,
    onSetDrawingMode,
    onNavigateToLocation,
    onClose
}: EditingToolsPanelProps) {
    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden md:absolute md:top-4 md:right-4 md:inset-auto md:w-80 md:max-w-[calc(100vw-2rem)] md:max-h-[calc(100vh-2rem)] md:shadow-lg md:bg-white/95 md:backdrop-blur-sm md:rounded-lg md:border md:border-gray-200 md:z-30">
            {/* Header */}
            <div className="p-3 bg-blue-600 text-white flex-shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Εργαλεία Επεξεργασίας</h3>
                    <Button
                        onClick={onClose}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-white hover:bg-white/20"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
                {selectedGeometry && (
                    <div className="text-xs mt-1 opacity-90 truncate">
                        {selectedGeometry.name}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Drawing Tools */}
                <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                    <h4 className="font-semibold text-xs mb-2 text-center">Εργαλεία Σχεδίασης</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            onClick={() => onSetDrawingMode('point')}
                            variant={drawingMode === 'point' ? "default" : "outline"}
                            size="sm"
                            className="gap-1 text-xs py-2"
                        >
                            <MapPin className="h-3 w-3" />
                            Σημείο
                        </Button>
                        <Button
                            onClick={() => onSetDrawingMode('polygon')}
                            variant={drawingMode === 'polygon' ? "default" : "outline"}
                            size="sm"
                            className="gap-1 text-xs py-2"
                        >
                            <Pentagon className="h-3 w-3" />
                            Περιοχή
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                        {drawingMode === 'point' 
                            ? 'Κάντε κλικ στον χάρτη για σημείο'
                            : 'Κάντε κλικ για να ξεκινήσετε σχεδίαση περιοχής'
                        }
                    </p>
                </div>

                {/* Textual Definition */}
                {selectedGeometry?.textualDefinition && (
                    <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                            📍 Γεωγραφικός Προσδιορισμός
                        </h4>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                            {selectedGeometry.textualDefinition}
                        </div>
                    </div>
                )}

                {/* Location Navigator */}
                {cityData && (
                    <div className="bg-green-50 p-3 rounded-md border border-green-200">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                            🗺️ Αναζήτηση Διεύθυνσης
                        </h4>
                        <LocationNavigator
                            city={cityData}
                            onNavigateToLocation={onNavigateToLocation}
                        />
                    </div>
                )}
            </div>
        </div>
    );
} 