"use client";

import { useState } from "react";
import { Link, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePathname } from "@/i18n/routing";
import { buildConsultationUrl, ConsultationView } from "./consultationUrl";

interface PermalinkButtonProps {
    entityId?: string | null;
    view: ConsultationView;
    className?: string;
}

export default function PermalinkButton({ entityId, view, className }: PermalinkButtonProps) {
    const [copied, setCopied] = useState(false);
    const pathname = usePathname();

    const handleCopy = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const livePathname = window.location.pathname || pathname;
            const fullUrl = `${window.location.origin}${buildConsultationUrl(livePathname, {
                view,
                entityId,
            })}`;
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy link:", err);
        }
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            title={copied ? "Ο σύνδεσμος αντιγράφηκε" : "Αντιγραφή συνδέσμου"}
            className={`h-6 w-6 p-0 text-muted-foreground hover:text-foreground ${className}`}
        >
            {copied ? (
                <Check className="h-3 w-3 text-green-600" />
            ) : (
                <Link className="h-3 w-3" />
            )}
        </Button>
    );
}
