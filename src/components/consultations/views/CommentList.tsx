"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { RelativeTime } from "@/components/RelativeTime";
import { ViewLink } from "./ui";
import { getSafeCommentHtml } from "@/lib/utils/sanitize";
import { cn } from "@/lib/utils";
import type { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

export interface CommentListProps {
    comments: ConsultationCommentWithUpvotes[];
    /** Where each comment was left, for the list of every comment; omit on a single place's list. */
    placeFor?: (comment: ConsultationCommentWithUpvotes) => { label: string; href: string } | null;
    currentUserId?: string;
    /** The viewer keeps the comments; these apply an agreement or a deletion to its copy. */
    onUpvoted: (commentId: string, change: { upvoteCount: number; hasUserUpvoted: boolean }) => void;
    onDeleted: (commentId: string) => void;
}

/** Comments with their author, age, place and agreement count. Agreeing needs an account. */
export default function CommentList({ comments, placeFor, currentUserId, onUpvoted, onDeleted }: CommentListProps) {
    const [busy, setBusy] = useState<string | null>(null);

    const toggleUpvote = async (commentId: string) => {
        if (!currentUserId || busy) return;
        setBusy(commentId);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/upvote`, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to toggle upvote');
            const { upvoted, upvoteCount } = await response.json();
            onUpvoted(commentId, { upvoteCount, hasUserUpvoted: upvoted });
        } catch (error) {
            console.error('Error toggling upvote:', error);
        } finally {
            setBusy(null);
        }
    };

    const remove = async (commentId: string) => {
        if (busy || !confirm('Να διαγραφεί το σχόλιό σας;')) return;
        setBusy(commentId);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/delete`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete comment');
            onDeleted(commentId);
        } catch (error) {
            console.error('Error deleting comment:', error);
        } finally {
            setBusy(null);
        }
    };

    return (
        <ul className="flex flex-col gap-3">
            {comments.map(comment => {
                const place = placeFor?.(comment);
                return (
                    <li key={comment.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <span className="font-semibold text-stone-900">{comment.user.name || 'Δημότης'}</span>
                            <span className="text-stone-500"><RelativeTime date={comment.createdAt} /></span>
                        </div>
                        {place && (
                            <ViewLink href={place.href} className="mt-0.5 block text-sm text-[#9a3412] underline-offset-2 hover:underline">{place.label}</ViewLink>
                        )}
                        <div
                            className="prose prose-sm mt-2 max-w-none text-[15px] text-stone-800 [overflow-wrap:anywhere]"
                            dangerouslySetInnerHTML={{ __html: getSafeCommentHtml(comment.body) }}
                        />
                        <div className="mt-3 flex items-center gap-4 text-sm">
                            <button
                                type="button"
                                onClick={() => toggleUpvote(comment.id)}
                                disabled={!currentUserId || busy === comment.id}
                                aria-pressed={comment.hasUserUpvoted}
                                title={currentUserId ? 'Συμφωνώ' : 'Για να συμφωνήσετε χρειάζεται λογαριασμός'}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                                    comment.hasUserUpvoted ? "bg-[#ffedd5] text-[#7c2d12]" : "text-stone-600 hover:bg-stone-100",
                                    !currentUserId && "cursor-default hover:bg-transparent"
                                )}
                            >
                                <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                                <span>Συμφωνώ</span>
                                {comment.upvoteCount > 0 && <span className="tabular-nums">{comment.upvoteCount}</span>}
                            </button>
                            {currentUserId === comment.userId && (
                                <button type="button" onClick={() => remove(comment.id)} disabled={busy === comment.id} className="text-stone-500 hover:text-stone-800">
                                    Διαγραφή
                                </button>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
