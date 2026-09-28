"use client";

import { MapPin, MessageCircle } from "lucide-react";
import type { Geometry } from "./types";

interface GeometryListItemProps {
    geometry: Geometry;
    onClick: () => void;
    subtitle?: string;
    rightLabel?: string;
    commentCount?: number;
}

/** One row in a list of geometries: name, address line, an optional subtitle and a comment count. */
export default function GeometryListItem({ geometry, onClick, subtitle, rightLabel, commentCount = 0 }: GeometryListItemProps) {
    return (
        <button
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
}
