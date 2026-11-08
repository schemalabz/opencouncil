"use client";

import { useEffect, useRef, useState } from "react";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { cn } from "@/lib/utils";

/** A summary like the ones the AI writes: what passed, who objected and why, what comes next. */
const SUMMARY =
    "Το Δημοτικό Συμβούλιο ενέκρινε κατά πλειοψηφία τη μελέτη πεζοδρόμησης της οδού Ερμού, από την πλατεία " +
    "Κοτζιά έως την οδό Αθηνάς, με προϋπολογισμό 1,2 εκατ. ευρώ. Η αντιπολίτευση καταψήφισε και ζήτησε να " +
    "προηγηθεί διαβούλευση με τους καταστηματάρχες για τη φορτοεκφόρτωση και τη στάθμευση. Ο αρμόδιος " +
    "αντιδήμαρχος δεσμεύτηκε να παρουσιάσει το χρονοδιάγραμμα των έργων στην επόμενη συνεδρίαση.";

/**
 * The summary block of a subject page, as a specimen: the heading, the AI
 * label beside it and the text under it, in the subject page's own sizes.
 * The label glows a few times when the card scrolls into view, so the eye
 * finds the thing the section is about. Once per page load, and never
 * under prefers-reduced-motion (globals.css).
 */
export function AiLabelSpecimen() {
    const ref = useRef<HTMLElement>(null);
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setSeen(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.8 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <figure
            ref={ref}
            className="not-prose mx-auto mt-6 max-w-xl rounded-2xl border border-border bg-background px-6 py-5 shadow-sm sm:px-7 sm:py-6"
        >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-base font-semibold tracking-[.01em] text-foreground">Σύνοψη</p>
                <span className={cn("-mx-1.5 -my-0.5 inline-flex rounded-md px-1.5 py-0.5", seen && "ai-label-flash")}>
                    <AIGeneratedBadge />
                </span>
            </div>
            <p className="mt-2.5 text-[14.5px] leading-[1.65] text-foreground/85">{SUMMARY}</p>
        </figure>
    );
}
