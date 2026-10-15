"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
// The locale-aware router: next/navigation's would push a bare "/sign-in" and drop the locale prefix.
import { useRouter } from "@/i18n/routing";
import { RelativeTime } from "@/components/RelativeTime";
import { captureConsultationResponsePublished } from "../analytics";
import { MunicipalityResponse, ResponseEditor } from "./CommentResponse";
import { smallActionClass, ViewLink } from "./ui";
import { getSafeCommentHtml } from "@/lib/utils/sanitize";
import { commentHtmlToPlainText } from "@/lib/utils/commentText";
import { cn } from "@/lib/utils";
import type { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import type { RespondResult } from "@/lib/db/consultationResponses";
import type { ConsultationCommentResponseView } from "@/lib/db/types";

export interface CommentListProps {
    comments: ConsultationCommentWithUpvotes[];
    /** Where each comment was left, for the list of every comment; omit on a single place's list. */
    placeFor?: (comment: ConsultationCommentWithUpvotes) => { label: string; href: string } | null;
    currentUserId?: string;
    /** Whether the page holds an unsent comment, which the sign-in for agreeing would throw away. */
    hasDraft?: boolean;
    /** "Δήμος Χ": the name the municipality's responses show under. */
    municipalityName?: string;
    /** Whether the reader administers the city: shows the response controls. The API checks again. */
    canRespond?: boolean;
    /** The viewer keeps the comments; these apply an agreement, a deletion or a response to its copy. */
    onUpvoted: (commentId: string, change: { upvoteCount: number; hasUserUpvoted: boolean }) => void;
    onDeleted: (commentId: string) => void;
    onResponded?: (commentId: string, response: ConsultationCommentResponseView | null) => void;
}

type Notice = { commentId: string; kind: 'error' | 'email-failed' };

const NOTICE_TEXT: Record<Notice['kind'], string> = {
    error: 'Κάτι πήγε στραβά. Δοκιμάστε ξανά σε λίγο.',
    'email-failed': 'Η απάντηση δημοσιεύτηκε, αλλά το email δεν στάλθηκε. Αποθηκεύστε ξανά για να ξαναπροσπαθήσουμε.',
};

/** Comments with their author, age, place, agreement count and the municipality's response. Agreeing needs an account: a signed-out reader goes to sign in. */
export default function CommentList({ comments, placeFor, currentUserId, hasDraft, municipalityName, canRespond, onUpvoted, onDeleted, onResponded }: CommentListProps) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ commentId: string; text: string } | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const startEditing = (commentId: string, text: string) => {
        setNotice(null);
        setEditing({ commentId, text });
    };

    const toggleUpvote = async (commentId: string) => {
        if (!currentUserId) {
            if (hasDraft && !confirm('Το σχόλιο που γράφετε θα χαθεί με τη σύνδεση. Να συνεχίσουμε;')) return;
            const back = window.location.pathname + window.location.search + window.location.hash;
            router.push(`/sign-in?callbackUrl=${encodeURIComponent(back)}`);
            return;
        }
        if (busy) return;
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

    const saveResponse = async (comment: ConsultationCommentWithUpvotes) => {
        if (!editing || busy) return;
        setBusy(comment.id);
        setNotice(null);
        try {
            const response = await fetch(`/api/consultations/comments/${comment.id}/response`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: editing.text }),
            });
            if (!response.ok) throw new Error('Failed to save response');
            // The dates arrive as JSON strings; new Date() reads either form.
            const data: RespondResult = await response.json();
            onResponded?.(comment.id, { ...data.response, createdAt: new Date(data.response.createdAt), updatedAt: new Date(data.response.updatedAt) });
            captureConsultationResponsePublished({ consultation_id: comment.consultationId, city_id: comment.cityId, comment_id: comment.id, created: data.created });
            setEditing(null);
            if (!data.emailSent) setNotice({ commentId: comment.id, kind: 'email-failed' });
        } catch (error) {
            console.error('Error saving response:', error);
            setNotice({ commentId: comment.id, kind: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const removeResponse = async (commentId: string) => {
        if (busy || !confirm('Να διαγραφεί η απάντηση του Δήμου;')) return;
        setBusy(commentId);
        setNotice(null);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/response`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete response');
            onResponded?.(commentId, null);
        } catch (error) {
            console.error('Error deleting response:', error);
            setNotice({ commentId, kind: 'error' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <ul className="flex flex-col gap-3">
            {comments.map(comment => {
                const place = placeFor?.(comment);
                const isEditing = editing?.commentId === comment.id;
                // One form at a time: while one is open, the others' controls wait, so no draft is thrown away.
                const responseLocked = busy === comment.id || (editing !== null && !isEditing);
                return (
                    <li key={comment.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                            <span className="font-semibold text-stone-900">{comment.user.name || 'Δημότης'}</span>
                            <span className="text-stone-500"><RelativeTime date={comment.createdAt} /></span>
                        </div>
                        {place && (
                            <ViewLink href={place.href} className="mt-0.5 block text-[15px] text-[#9a3412] underline-offset-2 hover:underline">{place.label}</ViewLink>
                        )}
                        <div
                            className="prose prose-sm mt-2 max-w-none text-[17px] text-stone-800 [overflow-wrap:anywhere]"
                            dangerouslySetInnerHTML={{ __html: getSafeCommentHtml(comment.body) }}
                        />
                        <div className="mt-3 flex items-center gap-4 text-[15px]">
                            <button
                                type="button"
                                onClick={() => toggleUpvote(comment.id)}
                                disabled={busy === comment.id}
                                aria-pressed={currentUserId ? comment.hasUserUpvoted : undefined}
                                title={currentUserId ? 'Συμφωνώ' : 'Συνδεθείτε για να συμφωνήσετε'}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                                    comment.hasUserUpvoted ? "bg-[#ffedd5] text-[#7c2d12]" : "text-stone-600 hover:bg-stone-100"
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
                            {canRespond && !comment.response && !isEditing && (
                                <button type="button" onClick={() => startEditing(comment.id, '')} disabled={responseLocked} className={cn(smallActionClass, "ml-auto disabled:opacity-50")}>
                                    Απάντηση ως Δήμος
                                </button>
                            )}
                        </div>
                        {isEditing ? (
                            <ResponseEditor
                                value={editing.text}
                                onChange={text => setEditing({ commentId: comment.id, text })}
                                onSubmit={() => saveResponse(comment)}
                                onCancel={() => setEditing(null)}
                                busy={busy === comment.id}
                                isNew={!comment.response}
                            />
                        ) : comment.response && (
                            <MunicipalityResponse
                                response={comment.response}
                                municipalityName={municipalityName}
                                canRespond={canRespond}
                                busy={responseLocked}
                                onEdit={() => startEditing(comment.id, commentHtmlToPlainText(comment.response!.body))}
                                onDelete={() => removeResponse(comment.id)}
                            />
                        )}
                        {notice?.commentId === comment.id && (
                            <p role={notice.kind === 'error' ? 'alert' : 'status'} className={cn("mt-2 text-[15px] font-semibold", notice.kind === 'error' ? "text-red-700" : "text-[#7c2d12]")}>
                                {NOTICE_TEXT[notice.kind]}
                            </p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
