import { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { AlertTriangle, Save, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import PermalinkButton from "./PermalinkButton";
import MarkdownContent from "./MarkdownContent";
import CommentSection from "./CommentSection";
import GeometryListItem from "./GeometryListItem";
import AddressLookupPanel from "./AddressLookupPanel";
import type { AddressLookupResult } from "./addressLookup";
import { RegulationData, ReferenceFormat, CurrentUser, GeoSetData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { Location } from "@/lib/types/onboarding";


interface DetailPanelProps {
    isOpen: boolean;
    onClose: () => void;
    detailType: 'geoset' | 'geometry' | 'search-location' | null;
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
    // Editing props
    isEditingMode?: boolean;
    selectedGeometryForEdit?: string | null;
    savedGeometries?: Record<string, any>;
    // Search location context - the selected search location for the search-location detail view
    searchLocation?: Location;
    /** What the regulation says about `searchLocation`, computed by the map. */
    addressLookup?: AddressLookupResult | null;
    consultationIsActive?: boolean;
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
    cityId,
    isEditingMode = false,
    selectedGeometryForEdit,
    savedGeometries,
    searchLocation,
    addressLookup,
    consultationIsActive = true
}: DetailPanelProps) {
    const isMobile = useIsMobile();

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
        if (detailType === 'search-location' && searchLocation) {
            return {
                label: toGreekUppercase('Η τοποθεσία σας'),
                title: searchLocation.text
            };
        }
        if (detailType === 'geoset' && currentGeoSet) {
            return {
                label: toGreekUppercase('Σύνολο Περιοχών'),
                title: currentGeoSet.name
            };
        }
        if (detailType === 'geometry' && currentGeometry) {
            const parentGeoSet = geoSets.find(gs => gs.geometries.some(g => g.id === currentGeometry.id));
            return {
                label: toGreekUppercase(parentGeoSet?.name ?? getGeometryTypeLabel(currentGeometry.type)),
                title: currentGeometry.name
            };
        }
        return { label: '', title: '' };
    };

    // Comment counts per geometry, indexed once: a list of hundreds of strips must not filter
    // every comment for every row on every render.
    const geometryCommentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        comments?.forEach(c => {
            if (c.entityType !== 'GEOMETRY') return;
            counts.set(c.entityId, (counts.get(c.entityId) ?? 0) + 1);
        });
        return counts;
    }, [comments]);
    const commentCountFor = (geometryId: string) => geometryCommentCounts.get(geometryId) ?? 0;

    const panelOpen = isOpen && !!detailType && (!!detailId || detailType === 'search-location');

    const renderContent = () => (
        <>
            {/* Header */}
            <div className={cn("relative flex-shrink-0", isMobile ? "px-4" : "pr-20")}>
                <div className="flex items-start justify-between group">
                    <div className="flex-1">
                        <div className="text-xs text-muted-foreground font-medium mb-1">
                            {getTitleData().label}
                        </div>
                        <div className="text-left text-lg leading-tight font-semibold">
                            {getTitleData().title}
                        </div>
                    </div>
                    {detailType !== 'search-location' && detailId && (
                        <PermalinkButton
                            entityId={detailId}
                            view="map"
                            className={cn(
                                "shrink-0 self-start",
                                !isMobile && "absolute right-10 -top-3",
                            )}
                        />
                    )}
                </div>
            </div>

            {/* Content */}
            <div
                className={cn("flex-1 overflow-y-auto overscroll-contain mt-4 pr-2", isMobile && "px-4")}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Search location: the zone, the area geometries and the points around the address */}
                {detailType === 'search-location' && searchLocation && addressLookup && (
                    <AddressLookupPanel
                        result={addressLookup}
                        commentCountFor={commentCountFor}
                        referenceFormat={referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                        onOpenGeometryDetail={onOpenGeometryDetail}
                    />
                )}

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
                                Περιοχές ({currentGeoSet.geometries.length})
                            </h4>
                            <div className="space-y-1.5">
                                {currentGeoSet.geometries
                                    .map((geometry) => (
                                        <GeometryListItem
                                            key={geometry.id}
                                            geometry={geometry}
                                            onClick={() => onOpenGeometryDetail?.(geometry.id)}
                                            commentCount={commentCountFor(geometry.id)}
                                        />
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
                                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 -ml-1 px-1 py-0.5 rounded hover:bg-muted/50"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    <span>{currentGeometryGeoSet.name}</span>
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

                                {/* Show saved geometry information */}
                                {savedGeometries?.[currentGeometry.id] && (
                                    <div className="flex items-center gap-1 text-blue-600 bg-blue-50 p-2 rounded-md">
                                        <Save className="h-3 w-3" />
                                        <span className="text-xs">Έχει αποθηκευτεί τοπικά νέα γεωμετρία</span>
                                    </div>
                                )}

                                {/* Show error for incomplete non-derived geometries */}
                                {currentGeometry.type !== 'derived' && (!('geojson' in currentGeometry) || !currentGeometry.geojson) && !savedGeometries?.[currentGeometry.id] && (
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
                                        {/* Show saved geometry data if available */}
                                        {savedGeometries?.[currentGeometry.id] ? (
                                            <>
                                                {savedGeometries?.[currentGeometry.id].type === 'Point' && (
                                                    <div>
                                                        Συντεταγμένες (τοπικά): {savedGeometries?.[currentGeometry.id].coordinates[1].toFixed(6)}, {savedGeometries?.[currentGeometry.id].coordinates[0].toFixed(6)}
                                                    </div>
                                                )}
                                                {savedGeometries?.[currentGeometry.id].type === 'Polygon' && (
                                                    <div>
                                                        Σημεία (τοπικά): {savedGeometries?.[currentGeometry.id].coordinates[0]?.length - 1 || 0} vertices
                                                    </div>
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
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Comments Section - only for geoset/geometry views */}
                {detailType !== 'search-location' && detailId && (
                    <div className="mt-6">
                        <CommentSection
                            entityType={detailType === 'geoset' ? 'geoset' : 'geometry'}
                            entityId={detailId}
                            entityTitle={currentGeoSet?.name || currentGeometry?.name || ''}
                            contactEmail={regulationData?.contactEmail}
                            comments={comments}
                            consultationId={consultationId}
                            cityId={cityId}
                            consultationIsActive={consultationIsActive}
                        />
                    </div>
                )}
            </div>
        </>
    );

    if (isMobile) {
        return (
            <Drawer
                open={panelOpen}
                onOpenChange={(open) => !open && onClose()}
                modal={false}
                shouldScaleBackground={false}
            >
                <DrawerContent hideOverlay className={cn("max-h-[45vh] flex flex-col", className)}>
                    <DrawerTitle className="sr-only">{getTitleData().title}</DrawerTitle>
                    <DrawerDescription className="sr-only">Λεπτομέρειες</DrawerDescription>
                    {renderContent()}
                </DrawerContent>
            </Drawer>
        );
    }

    // Non-modal: the reader clicks strip after strip on the map while the panel stays open.
    // Outside interactions are ignored (not dismissals); Escape and the close button still close.
    return (
        <Sheet open={panelOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
            <SheetContent
                side="right"
                className={cn("w-96 max-w-[calc(100vw-2rem)] sm:max-w-md flex flex-col", className)}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
            >
                <SheetTitle className="sr-only">{getTitleData().title}</SheetTitle>
                {renderContent()}
            </SheetContent>
        </Sheet>
    );
}
