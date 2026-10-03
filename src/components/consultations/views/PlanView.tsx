"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import type { ConsultationView } from "../consultationUrl";
import type { OverviewCard, RegulationData } from "../types";
import { cardClass, headingClass, OpenCouncilCredit, pageClass, secondaryButtonClass, smallActionClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

export interface PlanViewProps {
    overview: OverviewCard[];
    regulationData: RegulationData;
    /** A card to scroll to and mark, e.g. the resident card from "your street". */
    focusId: string | null;
    href: (view: ConsultationView, entityId?: string | null) => string;
    backHref: string;
    commentCounts: Map<string, number>;
    active: boolean;
    onReferenceClick: (entityId: string) => void;
}

export const planCardElementId = (cardId: string) => `plan-${cardId}`;

/** "The plan in two minutes": a few plain cards, each with one way to comment or to see it on the map. */
export default function PlanView({ overview, regulationData, focusId, href, backHref, commentCounts, active, onReferenceClick }: PlanViewProps) {
    useEffect(() => {
        if (!focusId) return;
        document.getElementById(planCardElementId(focusId))?.scrollIntoView({ block: 'start' });
    }, [focusId]);

    return (
        <div className={pageClass}>
            <ViewHeader backHref={backHref} title="Το σχέδιο σε 2 λεπτά" />
            <div className="flex flex-col gap-3 px-4 pb-8 pt-4">
                {overview.map(card => {
                    const commentCount = card.commentOn ? commentCounts.get(card.commentOn) ?? 0 : 0;
                    return (
                        <article
                            key={card.id}
                            id={planCardElementId(card.id)}
                            className={cn(cardClass, "flex scroll-mt-4 flex-col gap-2 p-5", card.id === focusId && "border-[#c2410c] ring-2 ring-[#c2410c]/30")}
                        >
                            <h2 className={cn(headingClass, "!text-xl")}>{card.title}</h2>
                            <MarkdownContent
                                content={card.body}
                                className="text-base leading-relaxed text-stone-700"
                                referenceFormat={regulationData.referenceFormat}
                                onReferenceClick={onReferenceClick}
                                regulationData={regulationData}
                            />
                            {card.commentOn ? (
                                <div className="flex items-center gap-3 pt-1">
                                    {active && (
                                        <ViewLink href={href('comment', card.commentOn)} className={smallActionClass}>
                                            {card.commentLabel ?? 'Σχολιάστε'}
                                        </ViewLink>
                                    )}
                                    {commentCount > 0 && (
                                        <ViewLink href={href('comment', card.commentOn)} className="text-sm text-stone-600 underline-offset-2 hover:underline">
                                            {commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}
                                        </ViewLink>
                                    )}
                                </div>
                            ) : card.explains?.length ? (
                                <ViewLink href={href('map', card.explains[0])} className={cn(textLinkClass, "pt-1 text-base")}>
                                    Δείτε στον χάρτη
                                </ViewLink>
                            ) : null}
                        </article>
                    );
                })}
                <ViewLink href={href('document')} className={cn(secondaryButtonClass, "mt-2")}>Ολόκληρη η μελέτη</ViewLink>
                <OpenCouncilCredit />
            </div>
        </div>
    );
}
