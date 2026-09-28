"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import MarkdownContent from "./MarkdownContent";
import GeometryListItem from "./GeometryListItem";
import { formatDistance, type AddressLookupResult, type NearbyItem } from "./addressLookup";
import type { GeoSetData } from "./types";

interface NearbyGroup {
    geoSet: GeoSetData;
    items: NearbyItem[];
}
import type { ReferenceFormat, RegulationData } from "./types";

const GROUP_PREVIEW_COUNT = 8;
const DEFAULT_NO_ZONE_TEXT = "Η διεύθυνση βρίσκεται εκτός των περιοχών του κανονισμού.";
const FALLBACK_COLOR = "#6b7280";

interface AddressLookupPanelProps {
    result: AddressLookupResult;
    commentCountFor?: (geometryId: string) => number;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    onOpenGeometryDetail?: (geometryId: string) => void;
}

function ColorDot({ color }: { color?: string }) {
    return <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color || FALLBACK_COLOR }} />;
}

function NearbyGroupList({ group, commentCountFor, onOpenGeometryDetail }: {
    group: NearbyGroup;
    commentCountFor?: (geometryId: string) => number;
    onOpenGeometryDetail?: (geometryId: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const items = expanded ? group.items : group.items.slice(0, GROUP_PREVIEW_COUNT);
    const hidden = group.items.length - items.length;

    return (
        <div>
            <div className="flex items-center gap-2 mb-1.5">
                <ColorDot color={group.geoSet.color} />
                <span className="text-sm font-medium">{group.geoSet.name}</span>
                <span className="text-xs text-muted-foreground">({group.items.length})</span>
            </div>
            <div className="space-y-1.5">
                {items.map(({ geometry, distance }) => (
                    <GeometryListItem
                        key={geometry.id}
                        geometry={geometry}
                        onClick={() => onOpenGeometryDetail?.(geometry.id)}
                        rightLabel={formatDistance(distance)}
                        commentCount={commentCountFor?.(geometry.id)}
                    />
                ))}
            </div>
            {hidden > 0 && (
                <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={() => setExpanded(true)}>
                    Εμφάνιση όλων ({group.items.length})
                </Button>
            )}
        </div>
    );
}

/**
 * "Βρες τον δρόμο σου": what the regulation says about a searched address. The zone it falls in,
 * the area geometries (parking strips, communities, ...) around it and the point geometries near it.
 */
export default function AddressLookupPanel({
    result,
    commentCountFor,
    referenceFormat,
    onReferenceClick,
    regulationData,
    onOpenGeometryDetail
}: AddressLookupPanelProps) {
    const { zone, zoneConfigured, street, nearby: points, config } = result;
    const areaGroups: NearbyGroup[] = [];
    for (const item of street) {
        const group = areaGroups.find((g) => g.geoSet.id === item.geoSet.id);
        if (group) group.items.push(item);
        else areaGroups.push({ geoSet: item.geoSet, items: [item] });
    }
    const hasAreas = areaGroups.length > 0;
    const hasPoints = points.length > 0;

    if (!zoneConfigured && !hasAreas && !hasPoints) {
        return (
            <div className="text-center py-6">
                <MapPin className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                    Δεν βρέθηκαν στοιχεία του κανονισμού κοντά σε αυτή τη διεύθυνση.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {zoneConfigured && (
                zone ? (
                    <div className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                            <ColorDot color={zone.geoSet.color} />
                            {zone.geoSet.name}
                        </div>
                        <div className="font-semibold">{zone.geometry.name}</div>
                        {zone.geometry.description && (
                            <MarkdownContent
                                content={zone.geometry.description}
                                variant="muted"
                                className="text-sm"
                                referenceFormat={referenceFormat}
                                onReferenceClick={onReferenceClick}
                                regulationData={regulationData}
                            />
                        )}
                        <Button variant="outline" size="sm" onClick={() => onOpenGeometryDetail?.(zone.geometry.id)}>
                            Λεπτομέρειες και σχόλια
                        </Button>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed p-3">
                        <MarkdownContent
                            content={config.noZoneText || DEFAULT_NO_ZONE_TEXT}
                            variant="muted"
                            className="text-sm"
                            referenceFormat={referenceFormat}
                            onReferenceClick={onReferenceClick}
                            regulationData={regulationData}
                        />
                    </div>
                )
            )}

            {hasAreas && (
                <>
                    {zoneConfigured && <Separator />}
                    <div className="space-y-3">
                        <h4 className="font-semibold text-sm">
                            Κοντινές θέσεις <span className="font-normal text-muted-foreground">(ακτίνα {config.streetRadiusMeters}μ.)</span>
                        </h4>
                        {areaGroups.map((group) => (
                            <NearbyGroupList
                                key={group.geoSet.id}
                                group={group}
                                commentCountFor={commentCountFor}
                                onOpenGeometryDetail={onOpenGeometryDetail}
                            />
                        ))}
                    </div>
                </>
            )}

            {hasPoints && (
                <>
                    {(zoneConfigured || hasAreas) && <Separator />}
                    <div>
                        <h4 className="font-semibold text-sm mb-3">
                            Κοντινά σημεία <span className="font-normal text-muted-foreground">(ακτίνα {config.nearbyRadiusMeters}μ.)</span>
                        </h4>
                        <div className="space-y-1.5">
                            {points.map(({ geometry, geoSet, distance }) => (
                                <GeometryListItem
                                    key={geometry.id}
                                    geometry={geometry}
                                    onClick={() => onOpenGeometryDetail?.(geometry.id)}
                                    subtitle={geoSet.name}
                                    rightLabel={formatDistance(distance)}
                                    commentCount={commentCountFor?.(geometry.id)}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}

            {zoneConfigured && !hasAreas && !hasPoints && (
                <p className="text-sm text-muted-foreground text-center">
                    Δεν βρέθηκαν θέσεις ή σημεία κοντά σε αυτή τη διεύθυνση.
                </p>
            )}
        </div>
    );
}
