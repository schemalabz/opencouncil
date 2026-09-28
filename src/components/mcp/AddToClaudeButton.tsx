"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { captureEvent } from "@/lib/analytics/capture";
import { claudeAddConnectorUrl } from "@/lib/mcp/claudeConnectorUrl";

/**
 * One click in place of the four-step paste: opens claude.ai's "Add custom
 * connector" form with the name and the address filled in.
 *
 * Public address only. A personal address is a bearer token, and a deep link
 * would write it into browser history and claude.ai's request logs.
 */
export function AddToClaudeButton({ serverUrl, className }: { serverUrl: string; className?: string }) {
    const t = useTranslations("mcp.clients.claude");

    return (
        <a
            href={claudeAddConnectorUrl(serverUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => captureEvent("mcp_add_to_claude_clicked")}
            className={cn(
                // Dark, not orange: the Claude mark is terracotta and vanishes on the
                // page's orange. The same dark as the command block and the tokens panel.
                "unstyled group inline-flex items-center justify-center gap-2.5 rounded-full bg-[#14110D] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#14110D]/90",
                className
            )}
        >
            <Image src="/logos/claude.svg" alt="" width={18} height={18} className="shrink-0" />
            {t("addToClaude")}
            <ArrowUpRight className="h-3.5 w-3.5 text-white/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </a>
    );
}
