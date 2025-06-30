import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Info, MessageCircle, AlertTriangle } from "lucide-react";
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
}

export default function GeometryItem({ id, name, enabled, color, geometry, onToggle, onOpenDetail, comments }: GeometryItemProps) {
    // Count comments for this geometry
    const geometryCommentCount = comments?.filter(comment =>
        comment.entityType === 'GEOMETRY' && comment.entityId === id
    ).length || 0;

    // Check if geometry has missing geojson data (only for non-derived geometries)
    const hasIncompleteData = geometry.type !== 'derived' && (!('geojson' in geometry) || !geometry.geojson);
    return (
        <div className="flex items-center gap-2">
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
                {hasIncompleteData && (
                    <div title="Η γεωμετρία δεν έχει συντεταγμένες">
                        <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    </div>
                )}
            </Label>
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
        </div>
    );
} 