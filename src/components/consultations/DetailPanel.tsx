import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import PermalinkButton from "./PermalinkButton";
import MarkdownContent from "./MarkdownContent";
import CommentSection from "./CommentSection";
import { Geometry, RegulationData, ReferenceFormat } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface GeoSetData {
    id: string;
    name: string;
    description?: string;
    geometries: Geometry[];
}

interface DetailPanelProps {
    isOpen: boolean;
    onClose: () => void;
    detailType: 'geoset' | 'geometry' | null;
    detailId: string | null;
    geoSets: GeoSetData[];
    baseUrl: string;
    className?: string;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    onOpenGeometryDetail?: (geometryId: string) => void;
    onOpenGeoSetDetail?: (geoSetId: string) => void;
    comments?: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId?: string;
    cityId?: string;
}

export default function DetailPanel({
    isOpen,
    onClose,
    detailType,
    detailId,
    geoSets,
    baseUrl,
    className,
    referenceFormat,
    onReferenceClick,
    regulationData,
    onOpenGeometryDetail,
    onOpenGeoSetDetail,
    comments,
    currentUser,
    consultationId,
    cityId
}: DetailPanelProps) {

    // Find the current detail data
    const currentGeoSet = detailType === 'geoset' ? geoSets.find(gs => gs.id === detailId) : null;
    const currentGeometry = detailType === 'geometry' ?
        geoSets.flatMap(gs => gs.geometries).find(g => g.id === detailId) : null;
    const currentGeometryGeoSet = currentGeometry ?
        geoSets.find(gs => gs.geometries.some(g => g.id === detailId)) : null;



    const getGeometryTypeLabel = (type: string) => {
        switch (type) {
            case 'point':
                return 'Σημείο';
            case 'circle':
                return 'Κύκλος';
            case 'polygon':
                return 'Πολύγωνο';
            default:
                return 'Άγνωστο';
        }
    };

    if (!isOpen || !detailType || !detailId) {
        return null;
    }

    return (
        <div className={cn(
            "absolute top-4 right-4 w-96 max-h-[calc(90vh-2rem)] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg z-30 flex flex-col",
            "md:w-96 w-[calc(100vw-2rem)]",
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                    {detailType === 'geoset' && currentGeoSet && (
                        <span className="font-semibold text-sm">Σύνολο Περιοχών</span>
                    )}
                    {detailType === 'geometry' && currentGeometry && (
                        <span className="font-semibold text-sm">
                            {getGeometryTypeLabel(currentGeometry.type)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <PermalinkButton href={`#${detailId}`} />
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

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
            >
                {/* GeoSet Details */}
                {currentGeoSet && (
                    <div className="p-4 space-y-4">
                        <div>
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-bold text-lg">{currentGeoSet.name}</h3>
                                <PermalinkButton href={`#${currentGeoSet.id}`} />
                            </div>
                            {currentGeoSet.description && (
                                <MarkdownContent
                                    content={currentGeoSet.description}
                                    variant="muted"
                                    className="text-sm"
                                    referenceFormat={referenceFormat}
                                    onReferenceClick={onReferenceClick}
                                    regulationData={regulationData}
                                />
                            )}
                        </div>

                        <Separator />

                        <div>
                            <h4 className="font-semibold text-sm mb-3">
                                Περιεχόμενες Περιοχές ({currentGeoSet.geometries.length})
                            </h4>
                            <div className="space-y-2">
                                {currentGeoSet.geometries.map((geometry) => (
                                    <button
                                        key={geometry.id}
                                        onClick={() => onOpenGeometryDetail?.(geometry.id)}
                                        className="w-full flex items-start gap-3 p-2 bg-muted/30 rounded-md hover:bg-muted/50 transition-colors text-left"
                                        title="Κάντε κλικ για λεπτομέρειες"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-sm truncate">
                                                {geometry.name}
                                            </div>
                                            {geometry.description && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {geometry.description}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Geometry Details */}
                {currentGeometry && (
                    <div className="p-4 space-y-4">
                        <div>
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-bold text-lg">{currentGeometry.name}</h3>
                                <PermalinkButton href={`#${currentGeometry.id}`} />
                            </div>
                            {currentGeometryGeoSet && (
                                <button
                                    onClick={() => onOpenGeoSetDetail?.(currentGeometryGeoSet.id)}
                                    className="text-xs text-left text-muted-foreground hover:text-foreground transition-colors mb-3"
                                >
                                    Μέρος του {currentGeometryGeoSet.name}
                                </button>
                            )}
                            {currentGeometry.description && (
                                <MarkdownContent
                                    content={currentGeometry.description}
                                    variant="muted"
                                    className="text-sm"
                                    referenceFormat={referenceFormat}
                                    onReferenceClick={onReferenceClick}
                                    regulationData={regulationData}
                                />
                            )}
                        </div>

                        {/* Geometric Information */}
                        <Separator />
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Πληροφορίες Γεωμετρίας</h4>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <div>Τύπος: {getGeometryTypeLabel(currentGeometry.type)}</div>
                                {currentGeometry.geojson.type === 'Point' && (
                                    <div>
                                        Συντεταγμένες: {currentGeometry.geojson.coordinates[1].toFixed(6)}, {currentGeometry.geojson.coordinates[0].toFixed(6)}
                                    </div>
                                )}
                                {currentGeometry.geojson.type === 'Polygon' && (
                                    <div>
                                        Σημεία: {currentGeometry.geojson.coordinates[0]?.length - 1 || 0} vertices
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Comments Section */}
                <div className="p-4">
                    <CommentSection
                        entityType={detailType === 'geoset' ? 'geoset' : 'geometry'}
                        entityId={detailId!}
                        entityTitle={currentGeoSet?.name || currentGeometry?.name || ''}
                        contactEmail={regulationData?.contactEmail}
                        comments={comments}
                        consultationId={consultationId}
                        cityId={cityId}
                    />
                </div>
            </div>
        </div>
    );
} 