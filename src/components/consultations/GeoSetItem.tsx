import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Info, MessageCircle } from "lucide-react";
import GeometryItem from "./GeometryItem";
import CommentSection from "./CommentSection";
import { Geometry } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

export type CheckboxState = 'checked' | 'indeterminate' | 'unchecked';

interface GeoSetItemProps {
    id: string;
    name: string;
    description?: string;
    color: string;
    checkboxState: CheckboxState;
    isExpanded: boolean;
    geometries: Geometry[];
    enabledGeometries: Set<string>;
    onToggleGeoSet: (id: string) => void;
    onToggleExpansion: (id: string) => void;
    onToggleGeometry: (id: string) => void;
    onOpenGeoSetDetail: (id: string) => void;
    onOpenGeometryDetail: (id: string) => void;
    contactEmail?: string;
    comments?: ConsultationCommentWithUpvotes[];
    consultationId?: string;
    cityId?: string;
}

export default function GeoSetItem({
    id,
    name,
    description,
    color,
    checkboxState,
    isExpanded,
    geometries,
    enabledGeometries,
    onToggleGeoSet,
    onToggleExpansion,
    onToggleGeometry,
    onOpenGeoSetDetail,
    onOpenGeometryDetail,
    contactEmail,
    comments,
    consultationId,
    cityId
}: GeoSetItemProps) {
    const hasGeometries = geometries.length > 0;
    const enabledCount = geometries.filter(g => enabledGeometries.has(g.id)).length;

    // Count comments for this geoset
    const geosetCommentCount = comments?.filter(comment =>
        comment.entityType === 'GEOSET' && comment.entityId === id
    ).length || 0;

    return (
        <div className="space-y-2">
            {/* GeoSet Header */}
            <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                    <Checkbox
                        id={`geoset-${id}`}
                        checked={checkboxState === 'checked'}
                        onCheckedChange={() => onToggleGeoSet(id)}
                        className="data-[state=checked]:text-current data-[state=checked]:border-current data-[state=checked]:bg-white border-current bg-white"
                        style={{
                            color: color,
                            borderColor: color,
                            backgroundColor: 'white'
                        }}
                    />
                    {checkboxState === 'indeterminate' && (
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                            style={{
                                color: color,
                            }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        </div>
                    )}
                </div>
                <Label
                    htmlFor={`geoset-${id}`}
                    className="text-sm font-medium flex-1 cursor-pointer"
                >
                    {name}
                </Label>
                <Button
                    onClick={() => onOpenGeoSetDetail(id)}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-muted-foreground hover:text-foreground border-muted-foreground/30"
                    title="Προβολή λεπτομερειών και σχολίων"
                >
                    <Info className="h-3 w-3 mr-1" />
                    <MessageCircle className="h-3 w-3 mr-1" />
                    <span className="text-xs">{geosetCommentCount}</span>
                </Button>
                {hasGeometries && (
                    <Button
                        onClick={() => onToggleExpansion(id)}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </Button>
                )}
            </div>

            {description && (
                <p className="text-xs text-muted-foreground ml-5">
                    {description}
                </p>
            )}

            {/* Individual Geometries */}
            {isExpanded && hasGeometries && (
                <div className="ml-5 space-y-2">
                    {geometries.map(geometry => (
                        <GeometryItem
                            key={geometry.id}
                            id={geometry.id}
                            name={geometry.name}
                            enabled={enabledGeometries.has(geometry.id)}
                            color={color}
                            onToggle={onToggleGeometry}
                            onOpenDetail={onOpenGeometryDetail}
                            comments={comments}
                        />
                    ))}
                </div>
            )}

            {hasGeometries && (
                <div className="ml-5 pt-1">
                    <Badge variant="outline" className="text-xs">
                        {enabledCount} / {geometries.length}
                    </Badge>
                </div>
            )}
        </div>
    );
} 