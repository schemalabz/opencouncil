"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import type { ConsultationView } from "../consultationUrl";
import { describeEntity } from "../entityDisplay";
import type { GeoSetData, RegulationData } from "../types";
import CommentList, { type CommentListProps } from "./CommentList";
import { cardClass, pageClass, textLinkClass, ViewHeader, ViewLink } from "./ui";

export interface CommentsViewProps {
    comments: ConsultationCommentWithUpvotes[];
    regulationData: RegulationData;
    geoSets: GeoSetData[];
    href: (view: ConsultationView, entityId?: string | null) => string;
    backHref: string;
    /** The printable list of every comment, for the municipality's staff. */
    printHref: string;
    currentUserId?: string;
    onUpvoted: CommentListProps['onUpvoted'];
    onDeleted: CommentListProps['onDeleted'];
}

type Sort = 'newest' | 'popular';

/** Every comment, newest or most agreed with first, each with the place it is about. */
export default function CommentsView({ comments, regulationData, geoSets, href, backHref, printHref, currentUserId, onUpvoted, onDeleted }: CommentsViewProps) {
    const [sort, setSort] = useState<Sort>('newest');

    const sorted = useMemo(() => [...comments].sort((a, b) => sort === 'popular'
        ? b.upvoteCount - a.upvoteCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ), [comments, sort]);

    const placeFor = (comment: ConsultationCommentWithUpvotes) => {
        const display = describeEntity(regulationData, geoSets, comment.entityId);
        if (!display) return null;
        const onMap = display.type === 'geometry' || display.type === 'geoset';
        const label = display.type === 'geometry'
            ? `${display.what} · ${display.where}`
            : display.type === 'article' ? `${display.where}: ${display.what}` : display.what;
        return { label, href: href(onMap ? 'map' : 'document', display.id) };
    };

    return (
        <div className={pageClass}>
            <ViewHeader backHref={backHref} title="Τι λένε οι δημότες" />
            <div className="flex flex-col gap-3 px-4 pb-8 pt-4">
                {comments.length === 0 ? (
                    <div className={cn(cardClass, "flex flex-col gap-2 p-5")}>
                        <p className="text-base text-stone-700">Κανείς δεν έχει σχολιάσει ακόμα.</p>
                        <ViewLink href={href('home')} className={cn(textLinkClass, "text-base")}>Ξεκινήστε από τον δρόμο σας</ViewLink>
                    </div>
                ) : (
                    <>
                        <div role="group" aria-label="Ταξινόμηση" className="flex gap-2">
                            {(['newest', 'popular'] as const).map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={sort === option}
                                    onClick={() => setSort(option)}
                                    className={cn(
                                        "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                                        sort === option ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                                    )}
                                >
                                    {option === 'newest' ? 'Νεότερα' : 'Δημοφιλή'}
                                </button>
                            ))}
                        </div>
                        <CommentList comments={sorted} placeFor={placeFor} currentUserId={currentUserId} onUpvoted={onUpvoted} onDeleted={onDeleted} />
                    </>
                )}
                <Link href={printHref} className="self-start px-1 pt-2 text-sm text-stone-600 underline underline-offset-2">
                    Όλα τα σχόλια σε μορφή για εκτύπωση
                </Link>
            </div>
        </div>
    );
}
