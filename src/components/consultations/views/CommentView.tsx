"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";
import { captureEvent } from "@/lib/analytics/capture";
import { cn } from "@/lib/utils";
import type { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import type { EntityDisplay } from "../entityDisplay";
import { buildConsultationUrl } from "../consultationUrl";
import CommentList, { type CommentListProps } from "./CommentList";
import { cardClass, Dot, pageClass, primaryButtonClass, SectionLabel, textLinkClass, navigateTo, ViewHeader, ViewLink } from "./ui";

export interface CommentViewProps {
    display: EntityDisplay;
    backHref: string;
    consultationId: string;
    cityId: string;
    active: boolean;
    /** The reader arrived from the confirmation link (`posted=1`). */
    posted: boolean;
    comments: ConsultationCommentWithUpvotes[];
    currentUserId?: string;
    onUpvoted: CommentListProps['onUpvoted'];
    onDeleted: CommentListProps['onDeleted'];
}

type Outcome =
    | { kind: 'published' }
    | { kind: 'pending'; email: string; emailSent: boolean }
    | { kind: 'error'; message: string };

const inputClass = "h-12 w-full rounded-xl border-[1.5px] border-stone-300 bg-white px-4 text-base text-stone-900 focus:border-[#c2410c] focus:outline-none";

/**
 * The comment form for one place, chapter or article. A signed-in reader's comment goes live at once;
 * anyone else leaves a name and an email, and the comment goes live when they open the link we send.
 */
export default function CommentView({ display, backHref, consultationId, cityId, active, posted, comments, currentUserId, onUpvoted, onDeleted }: CommentViewProps) {
    const router = useRouter();
    const { data: session, status } = useSession();
    const signedIn = status === 'authenticated' && !!session?.user;
    const [text, setText] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    // The confirmation link says "published" only if the comment is here: a link opened after it
    // expired, or a comment dropped on the way (a closed consultation, a removed place), is not.
    const [confirmation] = useState<'published' | 'missing' | null>(() =>
        !posted ? null : comments.some(comment => comment.userId === currentUserId) ? 'published' : 'missing'
    );
    // Once read, `posted` leaves the URL, so a reload or a shared link does not repeat the notice.
    useEffect(() => {
        if (posted) navigateTo(buildConsultationUrl('', { view: 'comment', entityId: display.id }), { replace: true });
    }, [posted, display.id]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!text.trim() || submitting) return;
        setSubmitting(true);
        setOutcome(null);
        try {
            const response = await fetch(`/api/consultations/${consultationId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cityId,
                    entityType: display.commentType,
                    entityId: display.id,
                    body: text,
                    ...(signedIn ? {} : { name, email }),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setOutcome({ kind: 'error', message: data.error === 'A valid email is required' ? 'Ελέγξτε το email σας.' : 'Κάτι πήγε στραβά. Δοκιμάστε ξανά σε λίγο.' });
                return;
            }
            captureEvent('consultation_comment_submitted', {
                consultation_id: consultationId,
                city_id: cityId,
                entity_type: display.commentType,
                pending: response.status === 202,
            });
            setText('');
            if (response.status === 202) {
                setOutcome({ kind: 'pending', email: email.trim(), emailSent: data.emailSent !== false });
            } else {
                setOutcome({ kind: 'published' });
                router.refresh();
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={pageClass}>
            <ViewHeader backHref={backHref} title="Το σχόλιό σας" />
            <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
                {confirmation === 'published' && (
                    <div role="status" className="flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-green-900">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <p className="text-base">Το σχόλιό σας δημοσιεύτηκε και στάλθηκε στον Δήμο. Ευχαριστούμε.</p>
                    </div>
                )}
                {confirmation === 'missing' && (
                    <div role="status" className="flex items-start gap-3 rounded-2xl bg-[#fff7ed] p-4 text-[#431407]">
                        <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <p className="text-base">Δεν βρήκαμε το σχόλιό σας εδώ. Ο σύνδεσμος ισχύει 24 ώρες. Αν έληξε, γράψτε το σχόλιο ξανά παρακάτω.</p>
                    </div>
                )}

                <div className={cn(cardClass, "flex items-center gap-3 px-4 py-3")}>
                    <Dot color={display.color} />
                    <div className="text-[15px] leading-snug">
                        <div className="font-semibold">{display.where ?? display.what}</div>
                        {display.where && <div className="text-stone-600">{display.what}</div>}
                    </div>
                </div>

                {!active ? (
                    <p className={cn(cardClass, "p-4 text-base text-stone-700")}>Η διαβούλευση έχει λήξει. Δεν δεχόμαστε πια σχόλια.</p>
                ) : outcome?.kind === 'published' ? (
                    <div role="status" className="flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-green-900">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <p className="text-base">Το σχόλιό σας δημοσιεύτηκε και στάλθηκε στον Δήμο.</p>
                    </div>
                ) : outcome?.kind === 'pending' ? (
                    <div role="status" className="flex items-start gap-3 rounded-2xl bg-[#fff7ed] p-4 text-[#431407]">
                        <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        {outcome.emailSent ? (
                            <p className="text-base">Σχεδόν έτοιμο. Σας στείλαμε email στο <strong>{outcome.email}</strong>. Πατήστε τον σύνδεσμο μέσα σε 24 ώρες για να δημοσιευτεί το σχόλιο.</p>
                        ) : (
                            <p className="text-base">Κρατήσαμε το σχόλιό σας, αλλά δεν μπορέσαμε να στείλουμε το email. Δοκιμάστε ξανά σε λίγο.</p>
                        )}
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="comment-text" className="text-[17px] font-semibold">Τι θα θέλατε να αλλάξει, ή να μείνει όπως είναι;</label>
                            <textarea
                                id="comment-text"
                                required
                                rows={6}
                                maxLength={5000}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Γράψτε ελεύθερα, όπως θα το λέγατε σε έναν γείτονα."
                                className="w-full resize-none rounded-xl border-[1.5px] border-stone-300 bg-white px-4 py-3 text-[17px] leading-relaxed text-stone-900 focus:border-[#c2410c] focus:outline-none"
                            />
                        </div>
                        {signedIn ? (
                            <p className="text-sm text-stone-600">Σχολιάζετε ως <strong>{session?.user?.name || session?.user?.email}</strong>.</p>
                        ) : (
                            <>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="comment-name" className="text-[15px] font-semibold">Το όνομά σας</label>
                                    <input id="comment-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="comment-email" className="text-[15px] font-semibold">Το email σας</label>
                                    <input id="comment-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                                    <p className="text-sm leading-snug text-stone-600">Θα σας στείλουμε έναν σύνδεσμο για να επιβεβαιώσετε το σχόλιο. Χωρίς κωδικούς, χωρίς εγγραφή.</p>
                                </div>
                            </>
                        )}
                        {outcome?.kind === 'error' && <p role="alert" className="text-sm font-semibold text-red-700">{outcome.message}</p>}
                        <button type="submit" disabled={submitting || !text.trim()} className={primaryButtonClass}>
                            {submitting ? 'Αποστολή…' : 'Αποστολή στον Δήμο'}
                        </button>
                        <p className="text-[13px] leading-relaxed text-stone-600">
                            Το σχόλιο δημοσιεύεται εδώ με το όνομά σας και στέλνεται στον Δήμο μαζί με το email σας. Μπορείτε να το διαγράψετε όποτε θέλετε.
                        </p>
                    </form>
                )}

                {comments.length > 0 && (
                    <section id="comments" className="flex flex-col gap-3 pt-2" aria-label="Σχόλια εδώ">
                        <SectionLabel>Τι έχουν πει άλλοι εδώ ({comments.length})</SectionLabel>
                        <CommentList comments={comments} currentUserId={session?.user?.id} onUpvoted={onUpvoted} onDeleted={onDeleted} />
                    </section>
                )}

                <ViewLink href={backHref} className={cn(textLinkClass, "self-start pt-2 text-base")}>Πίσω</ViewLink>
            </div>
        </div>
    );
}
