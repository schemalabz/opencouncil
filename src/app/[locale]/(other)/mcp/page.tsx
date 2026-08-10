import { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { env } from "@/env.mjs";
import { getCurrentUser } from "@/lib/auth";
import { listUserMcpTokens } from "@/lib/db/mcpTokens";
import { CopyButton } from "@/components/mcp/CopyButton";
import { McpTokenManager } from "@/components/mcp/McpTokenManager";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { ArrowRight, ArrowUpRight } from "lucide-react";

// Both entry points read the locale from params and pass it explicitly:
// without it, getTranslations races the [locale] layout's setRequestLocale
// (layouts and pages render in parallel) and falls back to the default
// locale — opencouncil.rs/mcp rendered Greek.
export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    const t = await getTranslations({ locale, namespace: "mcp.metadata" });
    return {
        title: t("title"),
        description: t("description"),
        alternates: await buildCanonicalAlternates("/mcp"),
        openGraph: {
            title: t("title"),
            description: t("description"),
            type: "website",
            siteName: "OpenCouncil",
        },
    };
}

function mcpBaseUrl(): string {
    return `${env.NEXTAUTH_URL.replace(/\/$/, "")}/mcp`;
}

/** Section heading — overrides the global centered h2 style, like /explain. */
function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="!text-left !text-2xl !font-bold tracking-tight sm:!text-3xl">{children}</h2>
    );
}

export default async function McpPage(props: { params: Promise<{ locale: string }> }) {
    const { locale } = await props.params;
    const t = await getTranslations({ locale, namespace: "mcp" });
    const user = await getCurrentUser();
    const tokens = user ? await listUserMcpTokens(user.id) : [];
    const serverUrl = mcpBaseUrl();

    return (
        <div className="mx-auto max-w-3xl px-4 pb-28 sm:px-6 lg:pb-20">
            {/* breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="breadcrumb">
                <Link href="/" className="hover:text-orange">
                    {t("home")}
                </Link>
                <span className="text-border">/</span>
                <span>{t("breadcrumb")}</span>
            </nav>

            {/* title + lead */}
            <header className="mt-5">
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{t("hero.title")}</h1>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t("hero.lead")}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground/80">{t("hero.standard")}</p>
            </header>

            {/* example questions */}
            <div className="mt-10">
                <h2 className="!text-left !text-xs !font-bold uppercase tracking-wider text-muted-foreground">
                    {t("hero.examplesTitle")}
                </h2>
                <ul className="mt-4 space-y-3">
                    {(["example1", "example2", "example3"] as const).map(key => (
                        <li
                            key={key}
                            className="border-l-2 border-orange/70 pl-4 leading-relaxed text-foreground/80"
                        >
                            «{t(`hero.${key}`)}»
                        </li>
                    ))}
                </ul>
            </div>

            {/* connect */}
            <section className="mt-16">
                <SectionHeading>{t("url.title")}</SectionHeading>
                <p className="mt-3 leading-relaxed text-muted-foreground">{t("url.intro")}</p>
                <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/40 py-2 pl-4 pr-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground/90">
                        {serverUrl}
                    </code>
                    <CopyButton value={serverUrl} />
                </div>

                <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
                    {(["claude", "chatgpt"] as const).map(client => (
                        <div key={client}>
                            <h3 className="!text-left flex items-center gap-2.5 text-lg font-semibold">
                                <Image
                                    src={client === "claude" ? "/logos/claude.svg" : "/logos/openai.svg"}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="shrink-0"
                                />
                                {t(`clients.${client}.title`)}
                            </h3>
                            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-orange">
                                <li>{t(`clients.${client}.step1`)}</li>
                                <li>{t(`clients.${client}.step2`)}</li>
                                <li>{t(`clients.${client}.step3`)}</li>
                            </ol>
                            <a
                                href={
                                    client === "claude"
                                        ? "https://claude.ai/settings/connectors"
                                        : "https://chatgpt.com/#settings/Connectors"
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="unstyled group mt-3 inline-flex items-center gap-1 text-sm text-orange hover:text-orange/80"
                            >
                                {t(`clients.${client}.openSettings`)}
                                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </a>
                        </div>
                    ))}
                </div>

                <div className="mt-10">
                    <h3 className="!text-left text-lg font-semibold">{t("clients.claudeCode.title")}</h3>
                    <p className="mt-3 leading-relaxed text-muted-foreground">{t("clients.claudeCode.description")}</p>
                    <code className="mt-3 block overflow-x-auto rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm text-foreground/90">
                        claude mcp add --transport http opencouncil {serverUrl}
                    </code>
                </div>
            </section>

            {/* personal access */}
            <section className="mt-16 rounded-2xl bg-[#14110D] p-6 text-white sm:p-8">
                <h2 className="!text-left !text-2xl !font-bold tracking-tight text-white sm:!text-3xl">
                    {t("tokens.title")}
                </h2>
                <p className="mt-3 leading-relaxed text-white/70">{t("tokens.description")}</p>
                <div className="mt-6">
                    {user ? (
                        <McpTokenManager initialTokens={tokens} mcpBaseUrl={serverUrl} />
                    ) : (
                        <div className="flex flex-wrap items-center gap-4">
                            <p className="text-sm text-white/60">{t("tokens.signInPrompt")}</p>
                            <Link
                                href="/sign-in?callbackUrl=/mcp"
                                className="unstyled group inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange/90"
                            >
                                {t("tokens.signIn")}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
