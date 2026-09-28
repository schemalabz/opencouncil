"use client";

import type { ReactNode } from "react";
import type { Location } from "@/lib/types/onboarding";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import { formatDistance, type AddressLookupResult } from "../addressLookup";
import type { ConsultationView } from "../consultationUrl";
import { findExplainingCard } from "../entityDisplay";
import type { OverviewCard } from "../types";
import { cardClass, Dot, headingClass, pageClass, primaryButtonClass, secondaryButtonClass, SectionLabel, smallActionClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

export interface StreetViewProps {
    address: Location;
    lookup: AddressLookupResult;
    overview?: OverviewCard[];
    href: (view: ConsultationView, entityId?: string | null) => string;
    commentCounts: Map<string, number>;
    /** The phone's small map; on a computer the big map beside the panel shows the street. */
    miniMap?: ReactNode;
}

/** "Your street": the zone you are in, what each side of your street becomes, and what is near. */
export default function StreetView({ address, lookup, overview, href, commentCounts, miniMap }: StreetViewProps) {
    const { zone, zoneConfigured, street, nearby, config } = lookup;
    const zoneCard = zone ? findExplainingCard(overview, zone.geoSet.id) : undefined;
    // The street's comment button speaks for the nearest side, or for the zone when no side is near.
    const commentTarget = street[0]?.geometry.id ?? zone?.geometry.id;

    return (
        <div className={pageClass}>
            <ViewHeader backHref={href('home')} eyebrow="Η διεύθυνσή σας" title={address.text} />
            {miniMap}
            <div className="flex flex-col gap-3 px-4 pb-8 pt-4">
                {zone ? (
                    <div className={cn(cardClass, "flex flex-col gap-2 p-5")}>
                        <div className="flex items-center gap-2.5">
                            <Dot color={zone.geoSet.color} className="h-3.5 w-3.5" />
                            <h2 className={cn(headingClass, "!text-2xl")}>Είστε στη {zone.geometry.name}</h2>
                        </div>
                        {zone.geometry.description && (
                            <MarkdownContent content={zone.geometry.description} className="text-base leading-relaxed text-stone-700" />
                        )}
                        {zoneCard && (
                            <ViewLink href={href('plan', zoneCard.id)} className={cn(textLinkClass, "text-base")}>
                                {zoneCard.linkLabel ?? zoneCard.title}
                            </ViewLink>
                        )}
                    </div>
                ) : zoneConfigured ? (
                    <div className={cn(cardClass, "border-dashed p-5")}>
                        <MarkdownContent content={config.noZoneText ?? 'Η διεύθυνση βρίσκεται έξω από τις περιοχές του σχεδίου.'} className="text-base leading-relaxed text-stone-700" />
                    </div>
                ) : null}

                <SectionLabel>Στον δρόμο σας</SectionLabel>
                {street.length > 0 ? (
                    <ul className={cn(cardClass, "overflow-hidden")}>
                        {street.map(({ geometry, geoSet }) => {
                            const count = commentCounts.get(geometry.id) ?? 0;
                            return (
                                <li key={geometry.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-3.5 last:border-b-0">
                                    <ViewLink href={href('map', geometry.id)} className="flex min-w-0 flex-1 items-center gap-3">
                                        <Dot color={geoSet.color} />
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="font-semibold">{geoSet.name}</span>
                                            <span className="text-sm leading-snug text-stone-600">
                                                {geometry.name}{geometry.textualDefinition ? ` · ${geometry.textualDefinition}` : ''}
                                                {count > 0 ? ` · ${count} ${count === 1 ? 'σχόλιο' : 'σχόλια'}` : ''}
                                            </span>
                                        </span>
                                    </ViewLink>
                                    <ViewLink href={href('comment', geometry.id)} className={smallActionClass}>Σχολιάστε</ViewLink>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className={cn(cardClass, "p-4 text-base text-stone-700")}>
                        Δεν βρήκαμε θέσεις στάθμευσης ακριβώς στη διεύθυνσή σας. Δείτε τον χάρτη για τους γύρω δρόμους.
                    </p>
                )}

                {nearby.length > 0 && (
                    <>
                        <SectionLabel>Κοντά σας</SectionLabel>
                        <ul className={cn(cardClass, "overflow-hidden")}>
                            {nearby.map(({ geometry, geoSet, distance }) => (
                                <li key={geometry.id} className="border-b border-stone-100 last:border-b-0">
                                    <ViewLink href={href('map', geometry.id)} className="flex items-center gap-3 px-4 py-3 text-[15px] hover:bg-stone-50">
                                        <Dot color={geoSet.color} />
                                        <span className="flex-1">{geoSet.name}: {geometry.name}</span>
                                        <span className="text-sm tabular-nums text-stone-500">{formatDistance(distance)}</span>
                                    </ViewLink>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {commentTarget && (
                    <ViewLink href={href('comment', commentTarget)} className={cn(primaryButtonClass, "mt-2")}>
                        Σχολιάστε τον δρόμο σας
                    </ViewLink>
                )}
                {miniMap && (
                    <ViewLink href={href('map')} className={secondaryButtonClass}>Δείτε όλο τον χάρτη</ViewLink>
                )}
            </div>
        </div>
    );
}
