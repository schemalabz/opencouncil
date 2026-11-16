"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import type { ConsultationView } from "../consultationUrl";
import { describeEntity, type EntityDisplay } from "../entityDisplay";
import type { OverviewCard, RegulationData } from "../types";
import { cardClass, CommentLink, headingClass, OpenCouncilCredit, pageClass, secondaryButtonClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

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
    /** The reader opened an item of the text from a card: a source of the card, or the item's comment form. */
    onUseCard?: (cardId: string, entityId: string) => void;
}

export const planCardElementId = (cardId: string) => `plan-${cardId}`;

/** The chapters and articles of the text that a card sums up; without `basedOn`, the one that takes its comments. */
function cardSources(card: OverviewCard, regulationData: RegulationData, target: EntityDisplay | null): EntityDisplay[] {
    const sources = card.basedOn ? card.basedOn.map(id => describeEntity(regulationData, [], id)) : [target];
    return sources.flatMap(display => display?.reference ? [display] : []);
}

/**
 * A few plain cards. Each names the items of the text that it sums up, and has one way to comment
 * or to see it on the map.
 */
export function PlanCards({ overview, regulationData, focusId, href, commentCounts, active, onReferenceClick, onUseCard }: PlanCardsProps) {
    useEffect(() => {
        if (!focusId) return;
        document.getElementById(planCardElementId(focusId))?.scrollIntoView({ block: 'start' });
    }, [focusId]);

    return (
        <>
            {overview.map(card => {
                const { commentOn } = card;
                const commentCount = commentOn ? commentCounts.get(commentOn) ?? 0 : 0;
                // A place on the map is not in the text: it has no reference and no name for the button.
                const target = commentOn ? describeEntity(regulationData, [], commentOn) : null;
                const sources = cardSources(card, regulationData, target);
                const commentLabel = card.commentLabel ?? target?.commentLabel ?? 'Σχολιάστε';
                return (
                    <article
                        key={card.id}
                        id={planCardElementId(card.id)}
                        className={cn(cardClass, "flex scroll-mt-4 flex-col gap-2 p-5", card.id === focusId && "border-[#c2410c] ring-2 ring-[#c2410c]/30")}
                    >
                        <div>
                            {sources.length > 0 && (
                                <p className="pb-0.5 text-[13px] text-stone-600">
                                    {sources.map((source, index) => (
                                        <Fragment key={source.id}>
                                            {index > 0 && <span aria-hidden="true"> · </span>}
                                            <ViewLink
                                                href={href('document', source.id)}
                                                onClick={() => onUseCard?.(card.id, source.id)}
                                                title={source.what}
                                                className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900 hover:decoration-stone-500"
                                            >
                                                {source.reference}
                                            </ViewLink>
                                        </Fragment>
                                    ))}
                                </p>
                            )}
                            <h2 className={cn(headingClass, "!text-xl")}>{card.title}</h2>
                        </div>
                        <MarkdownContent
                            content={card.body}
                            className="text-[17px] leading-relaxed text-stone-700"
                            referenceFormat={regulationData.referenceFormat}
                            onReferenceClick={onReferenceClick}
                            regulationData={regulationData}
                        />
                        {commentOn ? (
                            <div className="flex items-center gap-3 pt-1">
                                {active && (
                                    <CommentLink href={href('comment', commentOn)} onClick={() => onUseCard?.(card.id, commentOn)}>{commentLabel}</CommentLink>
                                )}
                                {commentCount > 0 && (
                                    <ViewLink href={href('comment', commentOn)} onClick={() => onUseCard?.(card.id, commentOn)} className="text-[15px] text-stone-600 underline-offset-2 hover:underline">
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
