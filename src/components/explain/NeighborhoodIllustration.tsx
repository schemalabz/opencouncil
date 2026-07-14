"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/formatters/time";
import type { NeighborhoodSubject } from "@/lib/db/neighborhood";

/**
 * Decorative, interactive neighbourhood illustration at the top of /explain —
 * trees & bench, school, town hall, shop, street light and a bin. Each element
 * lifts on hover; the drawn buildings (except the town hall) map to a real
 * council subject, revealed in the "ground" strip when hovered, focused or
 * tapped. Colours are the illustration's own palette; the accent (#F0521F) is
 * the app's orange.
 */
export function NeighborhoodIllustration({
    subjects,
}: {
    subjects: Record<string, NeighborhoodSubject | null>;
}) {
    const [active, setActive] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeSubject = active ? subjects[active] ?? null : null;

    // Tap/click outside the illustration dismisses the panel (mobile: also hides
    // the extra ground area). Desktop mouse-out is handled by onMouseLeave.
    useEffect(() => {
        if (!active) return;
        const onPointerDown = (e: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setActive(null);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [active]);

    // Props shared by every clickable element. Buildings with a subject reveal it;
    // the town hall instead links to the "διοίκηση του Δήμου" section.
    const el = (key: string, label: string) => {
        const subject = subjects[key];
        const interactive = !!subject || key === "townhall";
        if (!interactive) return { className: "ni-el" };
        return {
            className: "ni-el ni-el--live",
            role: "button" as const,
            tabIndex: 0,
            "aria-label": subject ? `${label}: ${subject.name}` : `${label}: διοίκηση του Δήμου`,
            onMouseEnter: () => setActive(key),
            onFocus: () => setActive(key),
            onClick: () => setActive(key),
        };
    };

    const isTownhall = active === "townhall";
    const showPanel = !!activeSubject || isTownhall;

    return (
        <figure className="not-prose mt-8">
            <div
                ref={containerRef}
                className="relative overflow-hidden rounded-2xl border border-border bg-card"
                onMouseLeave={() => setActive(null)}
            >
                <svg
                    viewBox="0 0 1320 588"
                    xmlns="http://www.w3.org/2000/svg"
                    role="img"
                    style={{ width: "100%", height: "auto", display: "block" }}
                    aria-label="Διαδραστική εικονογράφηση μιας γειτονιάς — δέντρα και παγκάκι, σχολείο, δημαρχείο, κατάστημα, φανάρι δρόμου και κάδος· κάθε στοιχείο δείχνει ένα πραγματικό θέμα που συζητήθηκε σε δημοτικό συμβούλιο."
                >
                    <desc>Πέρασε τον δείκτη ή πάτησε σε κάθε στοιχείο για να δεις ένα θέμα που συζητήθηκε.</desc>
                    <style>{`
.ni-el{transform-box:fill-box;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.25,.5,1);}
.ni-el--live{cursor:pointer;}
.ni-el--live:hover,.ni-el--live:focus-visible{transform:translateY(-9px) scale(1.035);outline:none;}
@media (prefers-reduced-motion:reduce){.ni-el{transition:none;}}
`}</style>
                    <rect x="0" y="0" width="1320" height="588" fill="#F7F3EA" />
                    <rect x="0" y="412" width="1320" height="176" fill="#ECE5D4" />
                    <line x1="0" y1="412" x2="1320" y2="412" stroke="#14110D" strokeWidth="3" />

                    {/* trees & bench → environment */}
                    <g {...el("trees", "Δέντρα & πράσινο")}>
                        <rect x="143" y="300" width="14" height="112" fill="#14110D" />
                        <circle cx="150" cy="262" r="56" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" />
                        <rect x="246" y="330" width="12" height="82" fill="#14110D" />
                        <circle cx="252" cy="305" r="42" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" />
                        <rect x="180" y="376" width="82" height="7" fill="#14110D" />
                        <rect x="186" y="383" width="6" height="29" fill="#14110D" />
                        <rect x="250" y="383" width="6" height="29" fill="#14110D" />
                        <rect x="186" y="398" width="76" height="5" fill="#14110D" />
                    </g>

                    {/* school → education */}
                    <g {...el("school", "Σχολείο")}>
                        <rect x="350" y="305" width="170" height="107" fill="#FFFFFF" stroke="#14110D" strokeWidth="4" />
                        <polygon points="332,307 435,222 538,307" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" strokeLinejoin="round" />
                        <text x="435" y="327" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="15" fontWeight="500" letterSpacing="1.5" fill="#14110D">ΣΧΟΛΕΙΟ</text>
                        <rect x="422" y="362" width="28" height="50" fill="#14110D" />
                        <rect x="368" y="338" width="30" height="30" fill="#A7C1DC" stroke="#14110D" strokeWidth="3" />
                        <rect x="472" y="338" width="30" height="30" fill="#A7C1DC" stroke="#14110D" strokeWidth="3" />
                    </g>

                    {/* town hall → (no subject yet) */}
                    <g {...el("townhall", "Δημαρχείο")}>
                        <rect x="590" y="404" width="290" height="10" fill="#FFFFFF" stroke="#14110D" strokeWidth="4" />
                        <rect x="602" y="312" width="266" height="92" fill="#FFFFFF" stroke="#14110D" strokeWidth="4" />
                        <rect x="616" y="316" width="22" height="84" fill="#EFE9DC" stroke="#14110D" strokeWidth="2" />
                        <rect x="664" y="316" width="22" height="84" fill="#EFE9DC" stroke="#14110D" strokeWidth="2" />
                        <rect x="712" y="316" width="22" height="84" fill="#EFE9DC" stroke="#14110D" strokeWidth="2" />
                        <rect x="760" y="316" width="22" height="84" fill="#EFE9DC" stroke="#14110D" strokeWidth="2" />
                        <rect x="808" y="316" width="22" height="84" fill="#EFE9DC" stroke="#14110D" strokeWidth="2" />
                        <rect x="596" y="300" width="278" height="16" fill="#FFFFFF" stroke="#14110D" strokeWidth="4" />
                        <polygon points="584,302 735,210 886,302" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" strokeLinejoin="round" />
                        <text x="735" y="284" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="500" letterSpacing="2.5" fill="#14110D">ΔΗΜΑΡΧΕΙΟ</text>
                        <line x1="735" y1="212" x2="735" y2="172" stroke="#14110D" strokeWidth="4" />
                        <polygon points="735,174 768,183 735,196" fill="#F0521F" />
                    </g>

                    {/* shop → commerce */}
                    <g {...el("store", "Κατάστημα")}>
                        <rect x="915" y="366" width="168" height="46" fill="#FFFFFF" stroke="#14110D" strokeWidth="4" />
                        <rect x="905" y="340" width="188" height="22" fill="#F0521F" stroke="#14110D" strokeWidth="3" />
                        <path d="M905,362 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0 q11.75,17 23.5,0" fill="#F0521F" stroke="#14110D" strokeWidth="3" strokeLinejoin="round" />
                        <rect x="1040" y="384" width="30" height="28" fill="#14110D" />
                        <rect x="930" y="378" width="44" height="30" fill="#A7C1DC" stroke="#14110D" strokeWidth="3" />
                    </g>

                    {/* street light → lighting */}
                    <g {...el("light", "Φωτισμός")}>
                        <rect x="1150" y="270" width="9" height="142" fill="#14110D" />
                        <rect x="1140" y="408" width="29" height="6" fill="#14110D" />
                        <line x1="1159" y1="278" x2="1172" y2="272" stroke="#14110D" strokeWidth="6" />
                        <circle cx="1181" cy="270" r="13" fill="#F0521F" stroke="#14110D" strokeWidth="3" />
                        <line x1="1181" y1="248" x2="1181" y2="240" stroke="#F0521F" strokeWidth="4" strokeLinecap="round" />
                        <line x1="1200" y1="256" x2="1207" y2="250" stroke="#F0521F" strokeWidth="4" strokeLinecap="round" />
                        <line x1="1160" y1="256" x2="1153" y2="250" stroke="#F0521F" strokeWidth="4" strokeLinecap="round" />
                        <line x1="1202" y1="278" x2="1210" y2="278" stroke="#F0521F" strokeWidth="4" strokeLinecap="round" />
                    </g>

                    {/* bin → cleanliness & waste */}
                    <g {...el("trash", "Καθαριότητα")}>
                        <polygon points="1236,362 1292,362 1286,412 1242,412" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" strokeLinejoin="round" />
                        <line x1="1252" y1="368" x2="1249" y2="406" stroke="#14110D" strokeWidth="3" />
                        <line x1="1264" y1="368" x2="1264" y2="406" stroke="#14110D" strokeWidth="3" />
                        <line x1="1276" y1="368" x2="1279" y2="406" stroke="#14110D" strokeWidth="3" />
                        <rect x="1230" y="350" width="68" height="13" rx="2" fill="#A7C1DC" stroke="#14110D" strokeWidth="4" />
                        <rect x="1256" y="342" width="16" height="9" fill="#A7C1DC" stroke="#14110D" strokeWidth="3" />
                    </g>
                </svg>

                {/* extra ground on small screens so the info card clears the buildings —
                    only while a panel is shown, so there's no dead space otherwise */}
                {showPanel && <div aria-hidden className="h-24 bg-[#ECE5D4] sm:hidden" />}

                {/* hint at the bottom of the ground — hidden once an element is selected */}
                {!showPanel && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 text-center text-[11px] text-muted-foreground sm:text-xs">
                        Πατήστε πάνω στα εικονίδια για να δείτε σχετικά θέματα
                    </div>
                )}

                {/* town hall → link to the "διοίκηση του Δήμου" section */}
                {isTownhall && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
                        <a
                            href="#dioikisi-dimou"
                            className="unstyled pointer-events-auto group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-3.5 py-2.5 shadow-sm backdrop-blur-sm transition-colors hover:border-orange/40 sm:px-4 sm:py-3"
                        >
                            <span className="min-w-0 font-semibold text-foreground">
                                Δείτε περισσότερα για τα διοικητικά όργανα του Δήμου
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-orange transition-transform group-hover:translate-x-0.5" />
                        </a>
                    </div>
                )}

                {/* info panel — sits over the ground strip, updates as elements are hovered */}
                {activeSubject && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
                        <Link
                            href={activeSubject.url}
                            className="unstyled pointer-events-auto group flex items-center gap-3 rounded-xl border border-border bg-card/95 px-3.5 py-2.5 shadow-sm backdrop-blur-sm transition-colors hover:border-orange/40 sm:px-4 sm:py-3"
                        >
                            <div className="min-w-0 flex-1">
                                {activeSubject.topicName && (
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: activeSubject.topicColor ?? "#F0521F" }}
                                        />
                                        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {activeSubject.topicName}
                                        </span>
                                    </div>
                                )}
                                <div className="mt-0.5 font-semibold text-foreground">
                                    {activeSubject.name}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {activeSubject.cityName} · {formatDate(new Date(activeSubject.date))}
                                </div>
                            </div>
                            <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-orange group-hover:text-orange/80 sm:flex">
                                Δες το θέμα
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-orange sm:hidden" />
                        </Link>
                    </div>
                )}
            </div>
        </figure>
    );
}
