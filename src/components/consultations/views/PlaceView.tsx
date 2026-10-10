"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import type { ConsultationView } from "../consultationUrl";
import type { EntityDisplay } from "../entityDisplay";
import type { OverviewCard, RegulationData } from "../types";
import { Dot, headingClass, primaryButtonClass, secondaryButtonClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

export interface PlaceViewProps {
    display: EntityDisplay;
    commentCount: number;
    explainingCard?: OverviewCard;
    href: (view: ConsultationView, entityId?: string | null) => string;
    closeHref: string;
    active: boolean;
    /** `sheet`: the phone's card over the map (the viewer positions it). `panel`: the computer's side panel. */
    variant: 'sheet' | 'panel';
    /** For `{REF:id}` links in the place's description. */
    regulationData: RegulationData;
    onReferenceClick: (entityId: string) => void;
}

/** A place tapped on the map: who parks there, where exactly, what it means, and a way to comment. */
export default function PlaceView({ display, commentCount, explainingCard, href, closeHref, active, variant, regulationData, onReferenceClick }: PlaceViewProps) {
    const body = (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
                <Dot color={display.color} className="h-3.5 w-3.5" />
                <h2 className={cn(headingClass, "!text-xl")}>{display.what}</h2>
            </div>
            {display.where && (
                <p className="text-base leading-snug text-stone-800">
                    {display.where}{display.detail ? ` · ${display.detail}` : ''}
                </p>
            )}
            {(display.meaning || explainingCard) && (
                <div className="text-[15px] leading-relaxed text-stone-600">
                    {display.meaning && (
                        <MarkdownContent
                            content={display.meaning}
                            className="inline text-[15px] text-stone-600 [&_p]:inline"
                            referenceFormat={regulationData.referenceFormat}
                            onReferenceClick={onReferenceClick}
                            regulationData={regulationData}
                        />
                    )}
                    {explainingCard && (
                        <> <ViewLink href={href('plan', explainingCard.id)} className={textLinkClass}>{explainingCard.linkLabel ?? explainingCard.title}</ViewLink></>
                    )}
                </div>
            )}
            <div className="flex gap-2.5 pt-1">
                {active ? (
                    <ViewLink href={href('comment', display.id)} className={cn(primaryButtonClass, "flex-1")}>Σχολιάστε εδώ</ViewLink>
                ) : (
                    <p className="flex-1 text-sm text-stone-600">Η διαβούλευση έχει λήξει.</p>
                )}
                {commentCount > 0 && (
                    <ViewLink href={href('comment', display.id)} className={cn(secondaryButtonClass, "w-auto px-4")}>
                        {commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}
                    </ViewLink>
                )}
            </div>
        </div>
    );

    if (variant === 'panel') {
        return (
            <div className="min-h-full bg-white">
                <ViewHeader backHref={closeHref} title="Στον χάρτη" />
                <div className="p-5">{body}</div>
            </div>
        );
    }

    return (
        <section aria-label={display.what} className="rounded-t-3xl bg-white px-5 pb-6 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]">
            <div className="mb-2 flex justify-between">
                <span className="mx-auto h-1 w-10 rounded-full bg-stone-300" aria-hidden="true" />
                <ViewLink href={closeHref} aria-label="Κλείσιμο" className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
                    <X className="h-5 w-5" aria-hidden="true" />
                </ViewLink>
            </div>
            {body}
        </section>
    );
}
