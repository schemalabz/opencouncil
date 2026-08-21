"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bell, Clapperboard, User, type LucideIcon } from "lucide-react";
import { canAccessMyHighlights } from "@/lib/db/highlights";

/**
 * The account menu, shared by every surface that offers one: the header
 * dropdown, the landing rail and the mobile drawer. One list and one message
 * namespace, so a new entry does not need an edit and a translation in each
 * of them.
 */
export interface AccountLink {
    href: string;
    /** Key in the `account` message namespace. */
    labelKey: string;
    icon: LucideIcon;
    /** Shown only to a viewer who has somewhere to go. */
    gate?: 'highlights';
}

export const ACCOUNT_LINKS: AccountLink[] = [
    { href: "/profile", labelKey: "profile", icon: User },
    { href: "/profile/highlights", labelKey: "myHighlights", icon: Clapperboard, gate: 'highlights' },
    { href: "/profile?tab=notifications", labelKey: "notifications", icon: Bell },
];

// Shared only while a call is in flight: the three menus can be mounted at
// once and all want the same answer. It is dropped as soon as the call settles,
// so a later mount re-asks — the answer changes the moment the user creates
// their first highlight, and a failed call must not hide the entry for good.
let inFlight: { userId: string; answer: Promise<boolean> } | null = null;

function askOnce(userId: string): Promise<boolean> {
    if (inFlight?.userId !== userId) {
        const answer = canAccessMyHighlights();
        inFlight = { userId, answer };
        const settle = () => {
            if (inFlight?.answer === answer) inFlight = null;
        };
        answer.then(settle, settle);
    }
    return inFlight.answer;
}

/**
 * The account links this viewer should see. Entries behind a gate stay out
 * until the answer arrives, so a menu never flashes a link it then withdraws.
 */
export function useAccountLinks(): AccountLink[] {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const [highlightsAllowed, setHighlightsAllowed] = useState(false);

    useEffect(() => {
        if (!userId) {
            setHighlightsAllowed(false);
            return;
        }

        let current = true;
        askOnce(userId)
            .then(allowed => { if (current) setHighlightsAllowed(allowed); })
            .catch(() => { if (current) setHighlightsAllowed(false); });
        return () => { current = false; };
    }, [userId]);

    return ACCOUNT_LINKS.filter(link => link.gate !== 'highlights' || highlightsAllowed);
}
