import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, MapPin, Pentagon, Check } from "lucide-react";
import { LocationNavigator } from './LocationNavigator';
import { CityWithGeometry } from '@/lib/db/cities';
import { Geometry } from "./types";
import { Location } from '@/lib/types/onboarding';
import { useToast } from "@/hooks/use-toast";

type DrawingMode = 'point' | 'polygon';

interface EditingToolsPanelProps {
    selectedGeometryForEdit: string;
    selectedGeometry: Geometry | undefined;
    drawingMode: DrawingMode;
    cityData: CityWithGeometry | null;
    onSetDrawingMode: (mode: DrawingMode) => void;
    onNavigateToLocation: (coordinates: [number, number]) => void;
    onSelectedLocationsChange?: (locations: Location[]) => void;
    onApplyLocationToGeometry?: (coordinates: [number, number]) => void;
    onClose: () => void;
}

export default function EditingToolsPanel({
    selectedGeometryForEdit,
    selectedGeometry,
    drawingMode,
    cityData,
    onSetDrawingMode,
    onNavigateToLocation,
    onSelectedLocationsChange,
    onApplyLocationToGeometry,
    onClose
}: EditingToolsPanelProps) {
    const { toast } = useToast();
    const [lastSearchedLocation, setLastSearchedLocation] = useState<Location | null>(null);
    const [applied, setApplied] = useState(false);

    const handleNavigateToLocation = (coordinates: [number, number]) => {
        onNavigateToLocation(coordinates);
        setApplied(false);
    };

    const handleSelectedLocationsChange = (locations: Location[]) => {
        onSelectedLocationsChange?.(locations);
        // Track the most recently added location
        if (locations.length > 0) {
            setLastSearchedLocation(locations[locations.length - 1]);
            setApplied(false);
        } else {
            setLastSearchedLocation(null);
            setApplied(false);
        }
    };

    const handleApply = () => {
        if (lastSearchedLocation && onApplyLocationToGeometry) {
            onApplyLocationToGeometry(lastSearchedLocation.coordinates);
            setApplied(true);
            toast({
                title: "Η τοποθεσία εφαρμόστηκε",
                description: lastSearchedLocation.text,
            });
        }
    };

    const isPointGeometry = selectedGeometry?.type === 'point';
    const showApplyButton = isPointGeometry && lastSearchedLocation && onApplyLocationToGeometry;

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden md:absolute md:top-4 md:right-4 md:inset-auto md:w-80 md:max-w-[calc(100vw-2rem)] md:max-h-[calc(100vh-2rem)] md:shadow-lg md:bg-white/95 md:backdrop-blur-sm md:rounded-lg md:border md:border-gray-200 md:z-30">
            {/* Header */}
            <div className="p-3 bg-blue-600 text-white flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">
                            Επεξεργασία: {selectedGeometry?.name || selectedGeometryForEdit}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="text-white hover:bg-blue-700 -mr-2"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Drawing Mode Selection */}
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                    <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                        🎯 Τρόπος Σχεδίασης
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant={drawingMode === 'point' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onSetDrawingMode('point')}
                            className="text-xs h-8 gap-1"
                        >
                            <MapPin className="h-3 w-3" />
                            Σημείο
                        </Button>
                        <Button
                            variant={drawingMode === 'polygon' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onSetDrawingMode('polygon')}
                            className="text-xs h-8 gap-1"
                        >
                            <Pentagon className="h-3 w-3" />
                            Περιοχή
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {drawingMode === 'point'
                            ? 'Κάντε κλικ στον χάρτη για να τοποθετήσετε ένα σημείο.'
                            : 'Κάντε κλικ στον χάρτη για να σχεδιάσετε μια περιοχή. Διπλό κλικ για να ολοκληρώσετε.'
                        }
                    </div>
                </div>

                {/* Textual Definition */}
                {selectedGeometry?.textualDefinition && (
                    <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                            📝 Περιγραφή Τοποθεσίας
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
                            onNavigateToLocation={handleNavigateToLocation}
                            onSelectedLocationsChange={handleSelectedLocationsChange}
                        />
                        {showApplyButton && (
                            <Button
                                size="sm"
                                onClick={handleApply}
                                disabled={applied}
                                className="w-full mt-2 text-xs h-8 gap-1"
                                variant={applied ? 'outline' : 'default'}
                            >
                                {applied ? (
                                    <>
                                        <Check className="h-3 w-3" />
                                        Εφαρμόστηκε
                                    </>
                                ) : (
                                    <>
                                        <MapPin className="h-3 w-3" />
                                        Χρήση ως τοποθεσία σημείου
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
