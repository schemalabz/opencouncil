"use client";

import { useState } from "react";
import {
    UserRound,
    Users,
    ClipboardCheck,
    MapPin,
    Sparkles,
    Gavel,
    User,
    PenLine,
    ChevronDown,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Interactive map of a municipality's governing bodies for the "Πως διοικείται
 * ένας δήμος;" section. Each card expands on click; orange cards flag what the
 * new Code of Local Government emphasises. Replaces the former static image.
 */
interface OrgCardData {
    id: string;
    Icon: LucideIcon;
    name: string;
    badge: string;
    sub: string;
    detail: string;
    org?: boolean;
    isNew?: boolean;
    tree?: { Icon: LucideIcon; label: string }[];
}

const GROUP_ORGANS: OrgCardData[] = [
    {
        id: "dimarchos",
        Icon: UserRound,
        name: "Δήμαρχος",
        badge: "άρθρο 109",
        sub: "Εκτελεστικό όργανο",
        detail: "Καθημερινή λειτουργία του δήμου & υλοποίηση των αποφάσεων του ΔΣ.",
    },
    {
        id: "symvoulio",
        Icon: Users,
        name: "Δημοτικό Συμβούλιο",
        badge: "άρθρο 120",
        sub: "Αποφασιστικό όργανο",
        detail: "Αποφασίζει για όλα τα θέματα του δήμου, εκτός από αυτά που αναθέτει στη ΔΕ.",
        tree: [
            { Icon: Gavel, label: "Πρόεδρος" },
            { Icon: User, label: "Αντιπρόεδρος" },
            { Icon: PenLine, label: "Γραμματέας" },
        ],
    },
    {
        id: "epitropi",
        Icon: ClipboardCheck,
        name: "Δημοτική Επιτροπή",
        badge: "άρθρο 138",
        sub: "Διοικητικό εργαλείο",
        detail: "Αποφασίζει για άδειες, έργα, ωράρια καταστημάτων.",
        org: true,
    },
];

const GROUP_LOCAL: OrgCardData[] = [
    {
        id: "koinotites",
        Icon: MapPin,
        name: "Δημοτικές Κοινότητες",
        badge: "άρθρα 161-167",
        sub: "Η φωνή της γειτονιάς",
        detail: "Ο πρόεδρος και το συμβούλιο της κοινότητας μεταφέρουν τα τοπικά ζητήματα της γειτονιάς στα όργανα του δήμου.",
    },
    {
        id: "neon",
        Icon: Sparkles,
        name: "Συμβούλιο νέων",
        badge: "άρθρα 156-160",
        sub: "Η φωνή των νέων",
        detail: "Νέος θεσμός με τον νέο Κώδικα. Δίνει φωνή στους νέους του δήμου και ο πρόεδρός του συμμετέχει στο Δημοτικό Συμβούλιο.",
        org: true,
        isNew: true,
    },
];

function OrgCard({ card, open, onToggle }: { card: OrgCardData; open: boolean; onToggle: () => void }) {
    const { Icon } = card;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn(
                "w-full rounded-xl border border-l-[3px] border-border bg-card p-3.5 text-left transition-colors hover:border-muted-foreground/40",
                card.org ? "border-l-orange" : "border-l-muted-foreground/50",
            )}
        >
            <div className="flex items-center gap-2.5">
                <Icon className={cn("h-5 w-5 shrink-0", card.org ? "text-orange" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 text-[15px] font-medium leading-tight text-foreground">
                    {card.name}
                </span>
                {card.isNew && (
                    <span className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-[11px] font-medium text-white">
                        ΝΕΟ
                    </span>
                )}
                <span
                    className={cn(
                        "shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                        card.org ? "bg-orange/10 text-orange" : "bg-muted text-muted-foreground",
                    )}
                >
                    {card.badge}
                </span>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180",
                    )}
                />
            </div>
            <div className="mt-1 text-[13px] text-muted-foreground">{card.sub}</div>

            <div
                className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
            >
                <div className="overflow-hidden">
                    <div className="mt-2.5 border-t border-border pt-2.5 text-sm leading-relaxed text-muted-foreground">
                        {card.detail}
                        {card.tree && (
                            <>
                                <div className="mt-3 text-xs font-medium text-muted-foreground">Προεδρείο</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {card.tree.map((n) => (
                                        <span
                                            key={n.label}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[13px] text-muted-foreground"
                                        >
                                            <n.Icon className="h-3.5 w-3.5" />
                                            {n.label}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}

export function MunicipalityGovernance() {
    const [open, setOpen] = useState<Set<string>>(new Set());
    const toggle = (id: string) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <div className="not-prose my-8">
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {GROUP_ORGANS.map((c) => (
                    <OrgCard key={c.id} card={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />
                ))}
            </div>

            <div className="my-5 flex items-center gap-3 text-[13px] font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {"Πιο κοντά στη γειτονιά & στη συμμετοχή"}
                <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {GROUP_LOCAL.map((c) => (
                    <OrgCard key={c.id} card={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />
                ))}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />
                    Θεσμικά όργανα
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange" />
                    Έμφαση στον νέο Κώδικα
                </span>
            </div>

            <div className="mt-3 text-center text-xs text-muted-foreground">
                «άρθρο» = ο{" "}
                <a
                    href="https://www.hellenicparliament.gr/UserFiles/c8827c35-4399-4fbb-8ea6-aebdc768f4f7/13325042.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-orange"
                >
                    νέος Κώδικας Τοπικής Αυτοδιοίκησης (ν. 5314/2026)
                </a>
            </div>
        </div>
    );
}
