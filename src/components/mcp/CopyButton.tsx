"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

export function CopyButton({ value, className }: { value: string; className?: string }) {
    const t = useTranslations("mcp.url");
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={copy}
            className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted",
                className
            )}
        >
            {copied ? <Check className="h-3.5 w-3.5 text-orange" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copy")}
        </button>
    );
}
