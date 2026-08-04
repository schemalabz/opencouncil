"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CopyButton } from "./CopyButton";
import { createMcpToken, revokeMcpToken } from "@/app/[locale]/(other)/mcp/actions";
import { formatDate } from "@/lib/formatters/time";

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
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);

    const create = async () => {
        setCreating(true);
        try {
            const token = await createMcpToken(name);
            setCreatedUrl(`${mcpBaseUrl}/${token.rawToken}`);
            setName("");
            setTokens([
                {
                    id: token.id,
                    name: token.name,
                    keyPrefix: token.rawToken.substring(0, 10),
                    createdAt: new Date(),
                    lastUsedAt: null,
                    revokedAt: null,
                },
                ...tokens,
            ]);
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (tokenId: string) => {
        await revokeMcpToken(tokenId);
        setTokens(tokens.map(token => (token.id === tokenId ? { ...token, revokedAt: new Date() } : token)));
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
                <input
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder={t("namePlaceholder")}
                    className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-orange/60 sm:max-w-sm"
                />
                <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="inline-flex h-10 items-center rounded-full bg-orange px-5 text-sm font-medium text-white transition-colors hover:bg-orange/90 disabled:opacity-60"
                >
                    {creating ? t("creating") : t("create")}
                </button>
            </div>

            {createdUrl && (
                <div className="rounded-xl border border-orange/40 bg-white/5 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{t("createdTitle")}</p>
                        <CopyButton
                            value={createdUrl}
                            className="border-white/25 bg-transparent text-white/90 hover:bg-white/10"
                        />
                    </div>
                    <code className="mt-3 block break-all rounded-lg bg-black/40 px-3 py-2.5 font-mono text-xs leading-relaxed text-white/90">
                        {createdUrl}
                    </code>
                    <p className="mt-3 text-xs leading-relaxed text-white/50">{t("createdNote")}</p>
                </div>
            )}

            {tokens.length === 0 ? (
                <p className="text-sm text-white/50">{t("empty")}</p>
            ) : (
                <div>
                    <h3 className="!text-left text-xs font-bold uppercase tracking-wider text-white/50">
                        {t("yourTokens")}
                    </h3>
                    <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
                        {tokens.map(token => (
                            <li key={token.id} className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="min-w-0">
                                    <div className="flex items-baseline gap-2.5">
                                        <span className={`truncate text-sm font-medium ${token.revokedAt ? "text-white/40 line-through" : "text-white"}`}>
                                            {token.name}
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
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
