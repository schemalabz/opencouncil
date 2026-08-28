"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CopyButton } from "./CopyButton";
import { createMcpToken, revokeMcpToken } from "@/app/[locale]/(other)/mcp/actions";
import { formatDate } from "@/lib/formatters/time";
import { isGeneratedMcpTokenName } from "@/lib/mcp/tokenNames";

type TokenRow = {
    id: string;
    name: string;
    keyPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
};

/** Personal-token manager. Styled for the dark "personal access" panel on /mcp. */
export function McpTokenManager({ initialTokens, mcpBaseUrl }: { initialTokens: TokenRow[]; mcpBaseUrl: string }) {
    const t = useTranslations("mcp.tokens");
    const [tokens, setTokens] = useState(initialTokens);
    const [creating, setCreating] = useState(false);
    // Keyed by token id, so the one-time URL renders inside its own row rather
    // than in a box above the list, detached from the entry it belongs to.
    const [created, setCreated] = useState<{ id: string; url: string } | null>(null);

    const create = async () => {
        setCreating(true);
        try {
            const token = await createMcpToken();
            setCreated({ id: token.id, url: `${mcpBaseUrl}/${token.rawToken}` });
            // Functional updates throughout: a revoke resolving after a create
            // would otherwise write back a snapshot without the new row, and
            // the raw URL renders inside that row and is shown only once.
            setTokens(previous => [
                {
                    id: token.id,
                    name: token.name,
                    keyPrefix: token.rawToken.substring(0, 10),
                    createdAt: new Date(),
                    lastUsedAt: null,
                    revokedAt: null,
                },
                ...previous,
            ]);
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (tokenId: string) => {
        await revokeMcpToken(tokenId);
        setTokens(previous =>
            previous.map(token => (token.id === tokenId ? { ...token, revokedAt: new Date() } : token))
        );
        // A revoked address is a dead credential, and the panel below tells the
        // reader to keep it like a password. Stop showing it.
        setCreated(previous => (previous?.id === tokenId ? null : previous));
    };

    return (
        <div className="space-y-5">
            <button
                type="button"
                onClick={create}
                disabled={creating}
                className="inline-flex h-10 items-center rounded-full bg-orange px-5 text-sm font-medium text-white transition-colors hover:bg-orange/90 disabled:opacity-60"
            >
                {creating ? t("creating") : t("create")}
            </button>

            {tokens.length === 0 ? (
                <p className="text-sm text-white/50">{t("empty")}</p>
            ) : (
                <div>
                    <h3 className="!text-left text-xs font-bold uppercase tracking-wider text-white/50">
                        {t("yourTokens")}
                    </h3>
                    <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
                        {tokens.map((token, index) => (
                            <li key={token.id} className="px-4 py-3">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-baseline gap-2.5">
                                            <span className={`truncate text-sm font-medium ${token.revokedAt ? "text-white/40 line-through" : "text-white"}`}>
                                                {isGeneratedMcpTokenName(token.name)
                                                    // Numbered by age, not by row: the list runs
                                                    // newest first, so a new address takes the next
                                                    // number and renumbers none of the others.
                                                    ? t("addressLabel", { index: tokens.length - index })
                                                    : token.name}
                                            </span>
                                            <code className="shrink-0 font-mono text-[11px] text-white/40">{token.keyPrefix}…</code>
                                        </div>
                                        <p className="mt-0.5 text-xs text-white/50">
                                            {t("createdAt")}: {formatDate(token.createdAt)}
                                            {" · "}
                                            {t("lastUsed")}: {token.lastUsedAt ? formatDate(token.lastUsedAt) : t("never")}
                                        </p>
                                    </div>
                                    {token.revokedAt ? (
                                        <span className="shrink-0 text-xs text-white/40">{t("revoked")}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => revoke(token.id)}
                                            className="shrink-0 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            {t("revoke")}
                                        </button>
                                    )}
                                </div>

                                {created?.id === token.id && (
                                    <div className="mt-3 rounded-lg border border-orange/40 bg-black/40 p-3 sm:p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-white">{t("createdTitle")}</p>
                                            <CopyButton
                                                value={created.url}
                                                className="border-white/25 bg-transparent text-white/90 hover:bg-white/10"
                                            />
                                        </div>
                                        <code className="mt-3 block break-all rounded-lg bg-black/50 px-3 py-2.5 font-mono text-xs leading-relaxed text-white/90">
                                            {created.url}
                                        </code>
                                        <p className="mt-3 text-xs leading-relaxed text-white/50">{t("createdNote")}</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
