import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { env } from "@/env.mjs";
import { getCurrentUser } from "@/lib/auth";
import { listUserMcpTokens } from "@/lib/db/mcpTokens";
import { CopyButton } from "@/components/mcp/CopyButton";
import { ConnectPanel } from "@/components/mcp/ConnectPanel";
import { McpTokenManager } from "@/components/mcp/McpTokenManager";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { ArrowRight } from "lucide-react";

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

// The walkthrough is linked rather than embedded: an embed sits between the
// reader and the address they came for, and browsers that block third-party
// storage render it as a blank frame with no error the page can detect.
const LOOM_VIDEO_URL = "https://www.loom.com/share/14194bb035464ce6abcd76b8b8faf873";

function mcpBaseUrl(): string {
    return `${env.NEXTAUTH_URL.replace(/\/$/, "")}/mcp`;
}

const EXAMPLES = ["example1", "example2", "example3", "example4"] as const;

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
            <header className="mt-9">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("hero.title")}</h1>
                {/* 17px, not text-lg: the Greek lead measures 736px at 18px against a
                    720px column, so it missed a single line by one word. `pretty` keeps
                    the last line from stranding a word where it does wrap. */}
                <p className="mt-5 text-pretty text-[17px] leading-relaxed text-muted-foreground">
                    {t("hero.lead")}
                </p>
            </header>

            {/* the address — the first thing on the page a reader can act on */}
            <section className="mt-12">
                <p className="text-sm font-medium text-muted-foreground">{t("url.label")}</p>
                {/* Stacked below sm: the address and the button side by side leave
                    too little width for the URL, which then breaks mid-token. */}
                <div className="mt-3 rounded-xl border p-3.5 shadow-sm sm:flex sm:items-center sm:gap-3 sm:py-2.5 sm:pl-5 sm:pr-2.5">
                    <code className="block min-w-0 flex-1 break-all font-mono text-base text-foreground sm:text-lg">
                        {serverUrl}
                    </code>
                    <CopyButton
                        value={serverUrl}
                        className="mt-3 w-full justify-center sm:mt-0 sm:w-auto"
                    />
                </div>

                <div className="mt-10">
                    <ConnectPanel serverUrl={serverUrl} videoUrl={LOOM_VIDEO_URL} />
                </div>
            </section>

            {/* what it is for, once the reader knows how to get it */}
            <section className="mt-20 border-t pt-14">
                <h2 className="!text-left !text-2xl !font-bold tracking-tight sm:!text-3xl">
                    {t("examples.title")}
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">{t("examples.lead")}</p>
                <ul className="mt-7 space-y-3.5">
                    {EXAMPLES.map((key, index) => (
                        <li
                            key={key}
                            className={`border-l-2 pl-4 leading-relaxed ${
                                index === 0 ? "border-orange text-foreground/90" : "border-border text-foreground/70"
                            }`}
                        >
                            «{t(`examples.${key}`)}»
                        </li>
                    ))}
                </ul>
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
