import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, Save, ChevronLeft, MessageCircle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import PermalinkButton from "./PermalinkButton";
import MarkdownContent from "./MarkdownContent";
import CommentSection from "./CommentSection";
import { Geometry, RegulationData, ReferenceFormat, StaticGeometry, CurrentUser, GeoSetData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { Location } from "@/lib/types/onboarding";

// Compute distance between two [lng, lat] coordinates in meters (Haversine)
function haversineDistance(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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
    searchLocation
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
            return {
                label: toGreekUppercase(getGeometryTypeLabel(currentGeometry.type)),
                title: currentGeometry.name
            };
        }
        return { label: '', title: '' };
    };

    // Get coordinates for a geometry (from saved or original)
    const getGeometryCoordinates = (geometry: Geometry): [number, number] | null => {
        if (savedGeometries?.[geometry.id]) {
            const saved = savedGeometries[geometry.id];
            if (saved.type === 'Point') return saved.coordinates;
        }
        if (geometry.type !== 'derived' && 'geojson' in geometry) {
            const geojson = (geometry as StaticGeometry).geojson;
            if (geojson?.type === 'Point') return geojson.coordinates as [number, number];
        }
        return null;
    };

    // Get comment count for a specific entity
    const getCommentCount = (entityType: string, entityId: string): number => {
        if (!comments) return 0;
        return comments.filter(c => c.entityType === entityType && c.entityId === entityId).length;
    };

    // Nearby points from ALL geoSets within 500m, sorted by distance to the search location
    const NEARBY_DISTANCE_LIMIT = 500; // meters
    const nearbyPoints = useMemo(() => {
        if (!searchLocation) return [];

        const allPoints: { geometry: Geometry; geoSetName: string; geoSetId: string; distance: number }[] = [];
        geoSets.forEach(gs => {
            gs.geometries.forEach(g => {
                if (g.type === 'point') {
                    const coords = getGeometryCoordinates(g);
                    if (coords) {
                        const dist = haversineDistance(searchLocation.coordinates, coords);
                        if (dist <= NEARBY_DISTANCE_LIMIT) {
                            allPoints.push({ geometry: g, geoSetName: gs.name, geoSetId: gs.id, distance: dist });
                        }
                    }
                }
            });
        });

        return allPoints.sort((a, b) => a.distance - b.distance);
    }, [searchLocation, geoSets, savedGeometries]); // eslint-disable-line react-hooks/exhaustive-deps -- getGeometryCoordinates depends only on savedGeometries which is tracked

    // Format distance for display
    const formatDistance = (meters: number): string => {
        if (meters < 1000) return `${Math.round(meters)}μ`;
        return `${(meters / 1000).toFixed(1)}χλμ`;
    };

    // Reusable geometry list item button
    const GeometryListItem = ({ geometry, onClick, subtitle, rightLabel }: {
        geometry: Geometry;
        onClick: () => void;
        subtitle?: string;
        rightLabel?: string;
    }) => {
        const commentCount = getCommentCount('GEOMETRY', geometry.id);
        return (
            <button
                key={geometry.id}
                onClick={onClick}
                className="w-full flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                title="Κάντε κλικ για λεπτομέρειες και σχόλια"
            >
                <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm leading-tight">
                        {geometry.name}
                    </div>
                    {geometry.textualDefinition && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            <MapPin className="h-3 w-3 inline mr-0.5 -mt-0.5" />
                            {geometry.textualDefinition}
                        </p>
                    )}
                    {subtitle && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {rightLabel && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {rightLabel}
                        </span>
                    )}
                    {commentCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            {commentCount}
                        </span>
                    )}
                </div>
            </button>
        );
    };

    return (
        <Sheet open={isOpen && !!detailType && (!!detailId || detailType === 'search-location')} onOpenChange={(open) => !open && onClose()}>
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
                        {detailType !== 'search-location' && detailId && (
                            <PermalinkButton href={`${baseUrl}?view=map#${detailId}`} />
                        )}
                    </div>
                </SheetHeader>

                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto overscroll-contain mt-4 pr-2"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {/* Search Location Details - shows nearest points from ALL communities */}
                    {detailType === 'search-location' && searchLocation && (
                        <div className="space-y-4">
                            {nearbyPoints.length > 0 ? (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Κοντινές θέσεις συλλογής σε ακτίνα {NEARBY_DISTANCE_LIMIT}μ.
                                    </p>

                                    <Separator />

                                    <div>
                                        <h4 className="font-semibold text-sm mb-3">
                                            Κοντινές Θέσεις ({nearbyPoints.length})
                                        </h4>
                                        <div className="space-y-1.5">
                                            {nearbyPoints.map(({ geometry, geoSetName, distance }) => (
                                                <GeometryListItem
                                                    key={geometry.id}
                                                    geometry={geometry}
                                                    onClick={() => onOpenGeometryDetail?.(geometry.id)}
                                                    subtitle={geoSetName}
                                                    rightLabel={formatDistance(distance)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <MapPin className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        Δεν βρέθηκαν θέσεις συλλογής σε ακτίνα {NEARBY_DISTANCE_LIMIT}μ.
                                    </p>
                                </div>
                            )}
                        </div>
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
                                    Θέσεις ({currentGeoSet.geometries.filter(g => g.type === 'point').length})
                                </h4>
                                <div className="space-y-1.5">
                                    {currentGeoSet.geometries
                                        .filter(g => g.type === 'point')
                                        .map((geometry) => (
                                            <GeometryListItem
                                                key={geometry.id}
                                                geometry={geometry}
                                                onClick={() => onOpenGeometryDetail?.(geometry.id)}
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
                            />
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
} 