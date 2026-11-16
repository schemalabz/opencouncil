"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import type { ConsultationView } from "../consultationUrl";
import type { OverviewCard, RegulationData } from "../types";
import { cardClass, headingClass, OpenCouncilCredit, pageClass, secondaryButtonClass, smallActionClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

export const PLAN_TITLE = 'Το σχέδιο σε 2 λεπτά';

export interface PlanCardsProps {
    overview: OverviewCard[];
    regulationData: RegulationData;
    /** A card to scroll to and mark, e.g. the resident card from "your street". */
    focusId: string | null;
    href: (view: ConsultationView, entityId?: string | null) => string;
    commentCounts: Map<string, number>;
    active: boolean;
    onReferenceClick: (entityId: string) => void;
}

export const planCardElementId = (cardId: string) => `plan-${cardId}`;

/** A few plain cards, each with one way to comment or to see it on the map. */
export function PlanCards({ overview, regulationData, focusId, href, commentCounts, active, onReferenceClick }: PlanCardsProps) {
    useEffect(() => {
        if (!focusId) return;
        document.getElementById(planCardElementId(focusId))?.scrollIntoView({ block: 'start' });
    }, [focusId]);

    return (
        <>
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
                            className="text-[17px] leading-relaxed text-stone-700"
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
                                    <ViewLink href={href('comment', card.commentOn)} className="text-[15px] text-stone-600 underline-offset-2 hover:underline">
                                        {commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}
                                    </ViewLink>
                                )}
                            </div>
                        ) : card.explains?.length ? (
                            <ViewLink href={href('map', card.explains[0])} className={cn(textLinkClass, "pt-1 text-[17px]")}>
                                Δείτε στον χάρτη
                            </ViewLink>
                        ) : null}
                    </article>
                );
            })}
        </>
    );
}

export interface PlanViewProps {
    /** The cards: `PlanCards`. */
    children: ReactNode;
    backHref: string;
    studyHref: string;
    /** What the full text is called: "Ολόκληρη η μελέτη". */
    studyTitle: string;
    /** On a computer the full text is beside this panel, so the link to it shows on a phone only. */
    textBeside?: boolean;
}

/** "The plan in two minutes": the cards, then the way to the full text. */
export default function PlanView({ children, backHref, studyHref, studyTitle, textBeside = false }: PlanViewProps) {
    return (
        <div className={pageClass}>
            <ViewHeader backHref={backHref} title={PLAN_TITLE} />
            <div className="flex flex-col gap-3 px-4 pb-8 pt-4">
                {children}
                <ViewLink href={studyHref} className={cn(secondaryButtonClass, "mt-2", textBeside && "lg:hidden")}>{studyTitle}</ViewLink>
                <OpenCouncilCredit />
            </div>
        </div>
    );
}
