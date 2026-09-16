"use client";

import { useEffect } from "react";
import { IdCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ClaimNoticeProps {
    variant: "default" | "destructive";
    title: string;
    description: string;
}

/**
 * What /api/join reported, shown once. The status arrives in `?claim=`,
 * which a reload, a save's router.refresh() or a bookmark would replay, so
 * the notice drops the parameter from the address bar as soon as it shows.
 * replaceState, not router.replace: the page must not render again.
 */
export function ClaimNotice({ variant, title, description }: ClaimNoticeProps) {
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("claim")) return;
        url.searchParams.delete("claim");
        window.history.replaceState(window.history.state, "", url.toString());
    }, []);

    return (
        <Alert variant={variant}>
            <IdCard className="h-4 w-4" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
        </Alert>
    );
}
