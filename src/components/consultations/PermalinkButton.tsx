"use client";

import { useState } from "react";
import { Link, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PermalinkButtonProps {
    href: string;
    className?: string;
}

export default function PermalinkButton({ href, className }: PermalinkButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            // Get current view state from URL
            const currentParams = new URLSearchParams(window.location.search);
            const currentView = currentParams.get('view') || 'document';

            // Build URL with current view state and the anchor
            const baseUrl = href.split('#')[0]; // Remove any existing hash
            const anchor = href.includes('#') ? `#${href.split('#')[1]}` : '';

            const params = new URLSearchParams();
            params.set('view', currentView);

            const fullUrl = `${window.location.origin}${baseUrl}?${params.toString()}${anchor}`;
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
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
