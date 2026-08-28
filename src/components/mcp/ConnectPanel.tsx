"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CirclePlay, Terminal } from "lucide-react";

const CLIENTS = ["claude", "chatgpt", "claudeCode"] as const;
type Client = (typeof CLIENTS)[number];

/** Where each client's connector settings live. Claude Code needs no page. */
const SETTINGS_URL: Partial<Record<Client, string>> = {
    claude: "https://claude.ai/settings/connectors",
    chatgpt: "https://chatgpt.com/#settings/Connectors",
};

const STEPS = ["step1", "step2", "step3", "step4"] as const;

/**
 * The install instructions, one client at a time. Two columns of four steps
 * read as twice the work; a reader only ever needs the column that matches the
 * assistant they use, so the others stay behind a tab.
 */
export function ConnectPanel({ serverUrl, videoUrl }: { serverUrl: string; videoUrl: string }) {
    const t = useTranslations("mcp");
    const [client, setClient] = useState<Client>("claude");
    const settingsUrl = SETTINGS_URL[client];

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("clients.pickLabel")}</p>
                <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="unstyled group inline-flex items-center gap-1.5 text-sm font-medium text-orange hover:text-orange/80"
                >
                    <CirclePlay className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                    {t("video.watch")}
                </a>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap" role="tablist">
                {CLIENTS.map(id => {
                    const selected = id === client;
                    return (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setClient(id)}
                            className={`inline-flex items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-medium transition-colors sm:rounded-full ${
                                selected
                                    ? "border-orange bg-orange/[0.07] text-foreground ring-1 ring-orange"
                                    : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                            }`}
                        >
                            {id === "claudeCode" ? (
                                <Terminal className="h-[18px] w-[18px] shrink-0" />
                            ) : (
                                <Image
                                    src={id === "claude" ? "/logos/claude.svg" : "/logos/openai.svg"}
                                    alt=""
                                    width={18}
                                    height={18}
                                    className="shrink-0"
                                />
                            )}
                            {t(`clients.${id}.title`)}
                        </button>
                    );
                })}
            </div>

            <div className="mt-5 rounded-xl border p-6 sm:p-7">
                {client === "claudeCode" ? (
                    <>
                        <p className="leading-relaxed text-muted-foreground">
                            {t("clients.claudeCode.description")}
                        </p>
                        <code className="mt-4 block overflow-x-auto rounded-xl bg-[#14110D] px-5 py-4 font-mono text-sm leading-relaxed text-white/90">
                            <span className="text-white/40">$ </span>
                            claude mcp add --transport http opencouncil {serverUrl}
                        </code>
                    </>
                ) : (
                    <>
                        <ol className="space-y-3.5">
                            {STEPS.map((step, index) => (
                                <li key={step} className="flex items-start gap-3.5">
                                    <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <span className="leading-relaxed text-foreground/90">
                                        {t(`clients.${client}.${step}`)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                        {settingsUrl && (
                            <a
                                href={settingsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="unstyled group mt-5 inline-flex items-center gap-1 text-sm font-medium text-orange hover:text-orange/80"
                            >
                                {t(`clients.${client}.openSettings`)}
                                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </a>
                        )}
                        {client === "claude" && (
                            <p className="mt-5 rounded-lg border border-orange/30 bg-orange/[0.06] px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground">
                                {t("clients.claude.mobileNotice")}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
