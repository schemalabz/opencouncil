import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X, AlertTriangle } from "lucide-react";
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
    color?: string;
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

    const removeGreekAccents = (text: string) => {
        return text
            .replace(/ά/g, 'α').replace(/Ά/g, 'Α')
            .replace(/έ/g, 'ε').replace(/Έ/g, 'Ε')
            .replace(/ή/g, 'η').replace(/Ή/g, 'Η')
            .replace(/ί/g, 'ι').replace(/Ί/g, 'Ι')
            .replace(/ό/g, 'ο').replace(/Ό/g, 'Ο')
            .replace(/ύ/g, 'υ').replace(/Ύ/g, 'Υ')
            .replace(/ώ/g, 'ω').replace(/Ώ/g, 'Ω')
            .replace(/ΐ/g, 'ι').replace(/ΐ/g, 'Ι')
            .replace(/ΰ/g, 'υ').replace(/ΰ/g, 'Υ');
    };

    const toGreekUppercase = (text: string) => {
        return removeGreekAccents(text.toUpperCase());
    };

    const getGeometryTypeLabel = (type: string) => {
        switch (type) {
            case 'point':
                return 'Σημείο';
            case 'circle':
                return 'Κύκλος';
            case 'polygon':
                return 'Πολύγωνο';
            case 'derived':
                return 'Παραγόμενη Περιοχή';
            default:
                return 'Άγνωστο';
        }
    };

    const getTitleData = () => {
        if (detailType === 'geoset' && currentGeoSet) {
            return {
                label: toGreekUppercase('Σύνολο Περιοχών'),
                title: currentGeoSet.name
            };
        }
        if (detailType === 'geometry' && currentGeometry) {
            return {
                label: toGreekUppercase(getGeometryTypeLabel(currentGeometry.type)),
                title: currentGeometry.name
            };
        }
        return { label: '', title: '' };
    };

    return (
        <Sheet open={isOpen && !!detailType && !!detailId} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="right"
                className={cn("w-96 max-w-[calc(100vw-2rem)] sm:max-w-md flex flex-col", className)}
                overlayClassName="bg-black/20"
            >
                <SheetHeader className="pr-6 flex-shrink-0">
                    <div className="flex items-start justify-between group">
                        <div className="flex-1">
                            <div className="text-xs text-muted-foreground font-medium mb-1">
                                {getTitleData().label}
                            </div>
                            <SheetTitle className="text-left text-lg leading-tight">
                                {getTitleData().title}
                            </SheetTitle>
                        </div>
                        <PermalinkButton href={`${baseUrl}?view=map#${detailId}`} />
                    </div>
                </SheetHeader>

                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto overscroll-contain mt-4 pr-2"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {/* GeoSet Details */}
                    {currentGeoSet && (
                        <div className="space-y-4">
                            <div className="group">
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
                                                {geometry.textualDefinition && (
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                                                        {geometry.textualDefinition}
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
                        <div className="space-y-4">
                            <div className="group">
                                {currentGeometryGeoSet && (
                                    <button
                                        onClick={() => onOpenGeoSetDetail?.(currentGeometryGeoSet.id)}
                                        className="text-xs text-left text-muted-foreground hover:text-foreground transition-colors mb-3"
                                    >
                                        Μέρος του {currentGeometryGeoSet.name}
                                    </button>
                                )}
                                {currentGeometry.description && (
                                    <div className="mb-3">
                                        <h4 className="font-semibold text-sm mb-2">Περιγραφή</h4>
                                        <MarkdownContent
                                            content={currentGeometry.description}
                                            variant="muted"
                                            className="text-sm"
                                            referenceFormat={referenceFormat}
                                            onReferenceClick={onReferenceClick}
                                            regulationData={regulationData}
                                        />
                                    </div>
                                )}
                                {currentGeometry.textualDefinition && (
                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Γεωγραφικός Προσδιορισμός</h4>
                                        <MarkdownContent
                                            content={currentGeometry.textualDefinition}
                                            variant="muted"
                                            className="text-sm"
                                            referenceFormat={referenceFormat}
                                            onReferenceClick={onReferenceClick}
                                            regulationData={regulationData}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Geometric Information */}
                            <Separator />
                            <div>
                                <h4 className="font-semibold text-sm mb-2">Πληροφορίες Γεωμετρίας</h4>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <div>Τύπος: {getGeometryTypeLabel(currentGeometry.type)}</div>

                                    {/* Show error for incomplete non-derived geometries */}
                                    {currentGeometry.type !== 'derived' && (!('geojson' in currentGeometry) || !currentGeometry.geojson) && (
                                        <div className="flex items-center gap-1 text-yellow-600 bg-yellow-50 p-2 rounded-md">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span className="text-xs">Η γεωμετρία δεν έχει συντεταγμένες και δεν εμφανίζεται στον χάρτη</span>
                                        </div>
                                    )}

                                    {currentGeometry.type === 'derived' ? (
                                        <>
                                            <div>Μέθοδος: {currentGeometry.derivedFrom.operation === 'buffer' ? 'Ζώνη Buffer' : 'Αφαίρεση'}</div>
                                            {currentGeometry.derivedFrom.operation === 'buffer' && (
                                                <>
                                                    <div>Πηγή: {currentGeometry.derivedFrom.sourceGeoSetId}</div>
                                                    <div>Ακτίνα: {currentGeometry.derivedFrom.radius} {currentGeometry.derivedFrom.units || 'meters'}</div>
                                                </>
                                            )}
                                            {currentGeometry.derivedFrom.operation === 'difference' && (
                                                <>
                                                    <div>Βάση: {currentGeometry.derivedFrom.baseGeoSetId}</div>
                                                    <div>Αφαίρεση: {currentGeometry.derivedFrom.subtractGeoSetIds.join(', ')}</div>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {'geojson' in currentGeometry && currentGeometry.geojson && currentGeometry.geojson.type === 'Point' && (
                                                <div>
                                                    Συντεταγμένες: {currentGeometry.geojson.coordinates[1].toFixed(6)}, {currentGeometry.geojson.coordinates[0].toFixed(6)}
                                                </div>
                                            )}
                                            {'geojson' in currentGeometry && currentGeometry.geojson && currentGeometry.geojson.type === 'Polygon' && (
                                                <div>
                                                    Σημεία: {currentGeometry.geojson.coordinates[0]?.length - 1 || 0} vertices
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Comments Section */}
                    <div className="mt-6">
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
            </SheetContent>
        </Sheet>
    );
} 