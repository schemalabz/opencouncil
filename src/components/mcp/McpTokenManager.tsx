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
                    className="h-10 w-full max-w-xs rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-orange/60"
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
                <div className="rounded-xl border border-orange/40 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{t("createdTitle")}</p>
                    <div className="mt-2 flex items-center gap-3">
                        <code className="min-w-0 flex-1 break-all font-mono text-xs text-white/90">{createdUrl}</code>
                        <CopyButton
                            value={createdUrl}
                            className="border-white/25 bg-transparent text-white/90 hover:bg-white/10"
                        />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">{t("createdNote")}</p>
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
                            <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                                <span className="font-medium text-white">{token.name}</span>
                                <code className="font-mono text-xs text-white/50">{token.keyPrefix}…</code>
                                <span className="text-xs text-white/50">
                                    {t("createdAt")}: {formatDate(token.createdAt)}
                                    {" · "}
                                    {t("lastUsed")}: {token.lastUsedAt ? formatDate(token.lastUsedAt) : t("never")}
                                </span>
                                <span className="ml-auto">
                                    {token.revokedAt ? (
                                        <span className="text-xs text-white/40">{t("revoked")}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => revoke(token.id)}
                                            className="rounded-full px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            {t("revoke")}
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
