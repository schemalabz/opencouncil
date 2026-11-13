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
 * While the card is on screen, the label keeps pulsing: a glow behind it,
 * and the label grows a little and turns orange. Reduced motion shows it
 * orange and still (globals.css).
 */
export function AiLabelSpecimen() {
    const ref = useRef<HTMLElement>(null);
    const [inView, setInView] = useState(false);

    // The pulse runs only while the card is on screen, so it costs nothing on the rest of the page.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <figure
            ref={ref}
            className="not-prose mx-auto mt-6 max-w-xl rounded-2xl border border-border bg-background px-6 py-5 shadow-sm sm:px-7 sm:py-6"
        >
            <figcaption className="mb-3.5 inline-flex items-center rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-orange">
                Υποθετικό παράδειγμα
            </figcaption>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-base font-semibold tracking-[.01em] text-foreground">Σύνοψη</p>
                <span className={cn("-mx-1.5 -my-0.5 inline-flex rounded-md px-1.5 py-0.5", inView && "ai-label-glow")}>
                    <AIGeneratedBadge className={cn(inView && "ai-label-lift")} />
                </span>
            </div>
            <p className="mt-2.5 text-[14.5px] leading-[1.65] text-foreground/85">{SUMMARY}</p>
        </figure>
    );
}
