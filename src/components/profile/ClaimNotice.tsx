"use client";

import { useEffect } from "react";
import { IdCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Drops `?claim=` from the address bar once its result is on screen. A
 * reload, a save's router.refresh() or a bookmark would otherwise replay the
 * result. replaceState, not router.replace: the page must not render again.
 */
export function useDropClaimParam() {
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("claim")) return;
        url.searchParams.delete("claim");
        window.history.replaceState(window.history.state, "", url.toString());
    }, []);
}

/** For a server page that renders the result itself. */
export function DropClaimParam() {
    useDropClaimParam();
    return null;
}

interface ClaimNoticeProps {
    variant: "default" | "destructive";
    title: string;
    description: string;
}

/** What /api/join reported, shown once above the profile. */
export function ClaimNotice({ variant, title, description }: ClaimNoticeProps) {
    useDropClaimParam();
    return (
        <Alert variant={variant}>
            <IdCard className="h-4 w-4" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
        </Alert>
    );
}
