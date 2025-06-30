import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Info, MessageCircle, AlertTriangle, Edit, Save, CheckCircle, Target, Trash2 } from "lucide-react";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { Geometry } from "./types";

interface GeometryItemProps {
    id: string;
    name: string;
    enabled: boolean;
    color: string;
    geometry: Geometry;
    onToggle: (id: string) => void;
    onOpenDetail: (id: string) => void;
    comments?: ConsultationCommentWithUpvotes[];
    // Editing props
    isEditingMode?: boolean;
    isSelectedForEdit?: boolean;
    hasLocalSave?: boolean;
    onSelectForEdit?: (id: string) => void;
    onDeleteSavedGeometry?: (id: string) => void;
}

export default function GeometryItem({ 
    id, 
    name, 
    enabled, 
    color, 
    geometry, 
    onToggle, 
    onOpenDetail, 
    comments,
    isEditingMode = false,
    isSelectedForEdit = false,
    hasLocalSave = false,
    onSelectForEdit,
    onDeleteSavedGeometry
}: GeometryItemProps) {
    // Count comments for this geometry
    const geometryCommentCount = comments?.filter(comment =>
        comment.entityType === 'GEOMETRY' && comment.entityId === id
    ).length || 0;

    // Check if geometry has missing geojson data (only for non-derived geometries)
    const hasOriginalGeojson = !!(geometry as any).geojson;
    const hasIncompleteData = geometry.type !== 'derived' && !hasOriginalGeojson && !hasLocalSave;
    const canEdit = geometry.type !== 'derived' && isEditingMode;

    return (
        <div className={`flex items-center gap-2 ${isSelectedForEdit ? 'bg-blue-50 rounded-md p-1' : ''}`}>
            <div className="relative flex items-center">
                <Checkbox
                    id={`geometry-${id}`}
                    checked={enabled}
                    onCheckedChange={() => onToggle(id)}
                    className="data-[state=checked]:text-current data-[state=checked]:border-current data-[state=checked]:bg-white border-current bg-white"
                    style={{
                        color: color,
                        borderColor: color,
                        backgroundColor: 'white'
                    }}
                />
            </div>
            <Label
                htmlFor={`geometry-${id}`}
                className="text-xs flex-1 cursor-pointer flex items-center gap-1"
            >
                {name}
                {/* Status indicators */}
                {hasLocalSave ? (
                    <div title="Έχει αποθηκευτεί τοπικά">
                        <Save className="h-3 w-3 text-blue-600" />
                    </div>
                ) : hasOriginalGeojson ? (
                    <div title="Έχει πρωτότυπες συντεταγμένες">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                    </div>
                ) : hasIncompleteData ? (
                    <div title="Η γεωμετρία δεν έχει συντεταγμένες">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                    </div>
                ) : null}
                {isSelectedForEdit && (
                    <div title="Επιλεγμένη για επεξεργασία">
                        <Target className="h-3 w-3 text-blue-600" />
                    </div>
                )}
            </Label>
            
            {/* Edit button - only show in editing mode for non-derived geometries */}
            {canEdit && onSelectForEdit && (
                <Button
                    onClick={() => onSelectForEdit(id)}
                    variant={isSelectedForEdit ? "default" : "outline"}
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    title="Επεξεργασία γεωμετρίας"
                >
                    <Edit className="h-2.5 w-2.5" />
                </Button>
            )}
            
            <Button
                onClick={() => onOpenDetail(id)}
                variant="outline"
                size="sm"
                className="h-5 px-1.5 text-muted-foreground hover:text-foreground border-muted-foreground/30"
                title="Προβολή λεπτομερειών και σχολίων"
            >
                <Info className="h-2.5 w-2.5 mr-0.5" />
                <MessageCircle className="h-2.5 w-2.5 mr-0.5" />
                <span className="text-xs">{geometryCommentCount}</span>
            </Button>

            {/* Delete button - only show if there's a locally saved geometry */}
            {hasLocalSave && onDeleteSavedGeometry && (
                <Button
                    onClick={() => {
                        if (confirm(`Θέλετε να διαγράψετε την τοπικά αποθηκευμένη γεωμετρία για "${name}";`)) {
                            onDeleteSavedGeometry(id);
                        }
                    }}
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                    title="Διαγραφή τοπικά αποθηκευμένης γεωμετρίας"
                >
                    <Trash2 className="h-2.5 w-2.5" />
                </Button>
            )}
        </div>
    );
} 