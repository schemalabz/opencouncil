"use client";

import type { FormEvent } from "react";
import { Reply } from "lucide-react";
import { RelativeTime } from "@/components/RelativeTime";
import type { ConsultationCommentResponseView } from "@/lib/db/types";
import { getSafeCommentHtml } from "@/lib/utils/sanitize";
import { cn } from "@/lib/utils";
import { primaryButtonClass, textareaClass, textLinkClass } from "./ui";

const quietButtonClass = "text-stone-500 hover:text-stone-800 disabled:opacity-60";

/** The municipality's response under a comment, in the municipality's name. */
export function MunicipalityResponse({ response, municipalityName, canRespond, busy, onEdit, onDelete }: {
    response: ConsultationCommentResponseView;
    municipalityName?: string;
    /** Whether the reader may change it: shows the edit and delete controls. */
    canRespond?: boolean;
    busy?: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const edited = new Date(response.updatedAt).getTime() - new Date(response.createdAt).getTime() > 60_000;
    return (
        <div className="mt-3 rounded-xl bg-[#fff7ed] px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                <Reply className="h-4 w-4 self-center text-[#9a3412]" aria-hidden="true" />
                <span className="font-semibold text-stone-900">{municipalityName ?? 'Δήμος'}</span>
                <span className="text-stone-500">
                    <RelativeTime date={response.createdAt} />{edited && ' · επεξεργάστηκε'}
                </span>
            </div>
            <div
                className="prose prose-sm mt-1 max-w-none text-[17px] text-stone-800 [overflow-wrap:anywhere]"
                dangerouslySetInnerHTML={{ __html: getSafeCommentHtml(response.body) }}
            />
            {canRespond && (
                <div className="mt-2 flex items-center gap-4 text-[15px]">
                    <button type="button" onClick={onEdit} disabled={busy} className={quietButtonClass}>Επεξεργασία</button>
                    <button type="button" onClick={onDelete} disabled={busy} className={quietButtonClass}>Διαγραφή</button>
                </div>
            )}
        </div>
    );
}

/** The form an administrator writes the municipality's response in. */
export function ResponseEditor({ value, onChange, onSubmit, onCancel, busy, isNew }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    busy?: boolean;
    /** A first response: the save also sends the email, and the form says so. */
    isNew: boolean;
}) {
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (value.trim() && !busy) onSubmit();
    };
    return (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-xl bg-[#fff7ed] p-4">
            <label htmlFor="municipality-response" className="text-[15px] font-semibold">Η απάντηση του Δήμου</label>
            <textarea
                id="municipality-response"
                required
                rows={4}
                maxLength={5000}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoFocus
                className={textareaClass}
            />
            <div className="flex items-center gap-4">
                <button type="submit" disabled={busy || !value.trim()} className={cn(primaryButtonClass, "w-auto px-5")}>
                    {busy ? 'Αποθήκευση…' : isNew ? 'Δημοσίευση απάντησης' : 'Αποθήκευση'}
                </button>
                <button type="button" onClick={onCancel} disabled={busy} className={cn(textLinkClass, "text-[15px]")}>Άκυρο</button>
            </div>
            {isNew && (
                <p className="text-[13px] leading-snug text-stone-600">
                    Η απάντηση δημοσιεύεται εδώ στο όνομα του Δήμου. Ο δημότης και ο Δήμος λαμβάνουν ένα email, για να συνεχίσουν τη συζήτηση μεταξύ τους.
                </p>
            )}
        </form>
    );
}
