import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { env } from "@/env.mjs";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    CATEGORY_LABELS,
    CLUSTERS,
    ExplainTopic,
    FEATURED_SIDE_SLUGS,
    FEATURED_SLUG,
    POPULAR_CHIPS,
    TOPICS,
    TOPIC_COUNT,
    getTopic,
} from "@/lib/explain/content";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { ExplainSearch } from "./ExplainSearch";

const PAGE_TITLE = "Λεξικό της αυτοδιοίκησης — Εξήγησε | OpenCouncil";
const PAGE_DESCRIPTION =
    "Απλές, ξεκάθαρες εξηγήσεις για τους όρους της τοπικής αυτοδιοίκησης: δημοτικά συμβούλια, αρμοδιότητες, δια περιφοράς, δημοτικές εκλογές και προϋπολογισμός δήμων.";

export async function generateMetadata({
    params: { locale },
}: {
    params: { locale: string };
}): Promise<Metadata> {
    const ogImageUrl = `${env.NEXTAUTH_URL}/api/og?pageType=search`;

    return {
        title: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        keywords: [
            "δημοτικά συμβούλια",
            "αρμοδιότητες δημοτικού συμβουλίου",
            "δια περιφοράς",
            "δημοτικές εκλογές 2028",
            "προϋπολογισμός δήμων",
            "τοπική αυτοδιοίκηση",
            "OpenCouncil",
        ],
        authors: [{ name: "OpenCouncil" }],
        openGraph: {
            title: "Λεξικό της αυτοδιοίκησης — OpenCouncil",
            description: PAGE_DESCRIPTION,
            type: "website",
            siteName: "OpenCouncil",
            images: [{ url: ogImageUrl, width: 1200, height: 630, alt: "Λεξικό της αυτοδιοίκησης" }],
            locale: locale === "en" ? "en_US" : "el_GR",
        },
        twitter: {
            card: "summary_large_image",
            title: "Λεξικό της αυτοδιοίκησης — OpenCouncil",
            description: PAGE_DESCRIPTION,
            images: [ogImageUrl],
        },
        alternates: buildHreflangAlternates("/explain", locale),
    };
}

const chipClass =
    "unstyled rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-orange hover:text-orange";

/** Internal link for a topic — real article route if published, else placeholder. */
function TopicLink({
    topic,
    className,
    children,
}: {
    topic: ExplainTopic;
    className?: string;
    children: React.ReactNode;
}) {
    if (topic.published) {
        return (
            <Link href={`/explain/${topic.slug}`} className={cn("unstyled", className)}>
                {children}
            </Link>
        );
    }
    return (
        <a href="#" className={cn("unstyled", className)}>
            {children}
        </a>
    );
}

function SectionHead({ title, count }: { title: string; count?: string }) {
    return (
        <div className="mb-5 mt-12 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
            {count && <span className="shrink-0 text-sm text-muted-foreground">{count}</span>}
        </div>
    );
}

function KbCard({ topic }: { topic: ExplainTopic }) {
    return (
        <TopicLink topic={topic} className="block h-full">
            <Card className="h-full">
                <CardContent className="flex h-full flex-col p-4">
                    <ImagePlaceholder src={topic.image} alt={topic.title} className="mb-4 h-32 w-full" />
                    <h3 className="px-1 text-lg font-semibold leading-tight">{topic.title}</h3>
                    <p className="mt-2 line-clamp-3 px-1 text-sm text-muted-foreground">{topic.snippet}</p>
                    <div className="mt-auto flex items-center justify-between px-1 pt-4 text-sm">
                        <Badge variant={topic.accentTag ? "default" : "secondary"}>
                            {CATEGORY_LABELS[topic.category]}
                        </Badge>
                        <span className="inline-flex items-center gap-1 font-semibold text-orange">
                            Άνοιγμα
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                    </div>
                </CardContent>
            </Card>
        </TopicLink>
    );
}

export default function ExplainHubPage() {
    const featured = getTopic(FEATURED_SLUG)!;
    const sideTopics = FEATURED_SIDE_SLUGS.map((slug) => getTopic(slug)!);

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Λεξικό της αυτοδιοίκησης — OpenCouncil",
        description: "Εξηγήσεις βασικών όρων της τοπικής αυτοδιοίκησης.",
        url: `${env.NEXTAUTH_URL}/explain`,
        hasPart: Object.values(TOPICS).map((t) => ({
            "@type": "Article",
            headline: t.title,
            ...(t.published ? { url: `${env.NEXTAUTH_URL}/explain/${t.slug}` } : {}),
        })),
    };

    return (
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />

            {/* hero */}
            <section className="pt-8 sm:pt-12">
                <nav className="mb-5 flex items-center gap-2 text-sm text-muted-foreground" aria-label="breadcrumb">
                    <Link href="/" className="hover:text-orange">
                        Αρχική
                    </Link>
                    <span className="text-border">/</span>
                    <span>Εξήγησε</span>
                </nav>
                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-orange">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                    Λεξικό της αυτοδιοίκησης
                </p>
                <h1 className="mt-4 max-w-[16ch] text-4xl font-bold tracking-tight sm:text-5xl">
                    Η τοπική αυτοδιοίκηση, <em>απλά</em>
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                    Τι είναι ένα δημοτικό συμβούλιο; Τι σημαίνει «δια περιφοράς»; Πώς διαβάζεται ο προϋπολογισμός
                    ενός δήμου; Σύντομες, τεκμηριωμένες απαντήσεις — και ο τρόπος να τις δεις να συμβαίνουν στον
                    δήμο σου.
                </p>
                <ExplainSearch placeholder="Αναζήτησε έναν όρο — π.χ. «δια περιφοράς», «αρμοδιότητες»…" />
                <div className="mt-4 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                    <span>Δημοφιλή:</span>
                    {POPULAR_CHIPS.map((chip) => (
                        <Link key={chip} href={`/search?query=${encodeURIComponent(chip)}`} className={chipClass}>
                            {chip}
                        </Link>
                    ))}
                </div>
            </section>

            {/* featured strip */}
            <section>
                <SectionHead title="Οι πιο αναζητούμενες απαντήσεις" count={`${TOPIC_COUNT} άρθρα`} />
                <div className="grid gap-4 md:grid-cols-2">
                    <TopicLink topic={featured} className="block h-full">
                        <Card className="h-full">
                            <CardContent className="flex h-full flex-col bg-orange/5 p-6 sm:p-8">
                                <ImagePlaceholder
                                    src={featured.image}
                                    alt={featured.title}
                                    className="mb-5 h-36 w-full"
                                />
                                <span className="text-sm font-semibold uppercase tracking-wider text-orange">
                                    Ξεκίνα από εδώ
                                </span>
                                <h3 className="mt-3 text-2xl font-bold leading-tight">{featured.title}</h3>
                                <p className="mt-3 text-muted-foreground">
                                    Το ανώτατο αποφασιστικό όργανο κάθε δήμου. Αποτελείται από αιρετούς δημοτικούς
                                    συμβούλους και αποφασίζει για τα σημαντικότερα ζητήματα — από τον προϋπολογισμό
                                    μέχρι τα τοπικά έργα.
                                </p>
                                <span className="mt-auto inline-flex items-center gap-2 pt-6 font-semibold text-orange">
                                    Διάβασε την απάντηση
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </span>
                            </CardContent>
                        </Card>
                    </TopicLink>

                    <div className="flex flex-col gap-4">
                        {sideTopics.map((topic, i) => (
                            <TopicLink key={topic.slug} topic={topic} className="block">
                                <Card>
                                    <CardContent className="flex items-center gap-4 p-4">
                                        <ImagePlaceholder
                                            src={topic.image}
                                            alt={topic.title}
                                            className="h-12 w-12 shrink-0 rounded-lg"
                                        />
                                        <span className="w-5 shrink-0 text-lg font-bold text-orange">
                                            {String(i + 2).padStart(2, "0")}
                                        </span>
                                        <div>
                                            <h4 className="font-semibold leading-tight">{topic.title}</h4>
                                            <p className="mt-0.5 text-sm text-muted-foreground">
                                                {topic.subtitle ?? CATEGORY_LABELS[topic.category]}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TopicLink>
                        ))}
                    </div>
                </div>
            </section>

            {/* topic clusters */}
            {CLUSTERS.map((cluster) => (
                <section key={cluster.title}>
                    <SectionHead title={cluster.title} />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {cluster.slugs.map((slug) => (
                            <KbCard key={slug} topic={getTopic(slug)!} />
                        ))}
                    </div>
                </section>
            ))}

            {/* product tie-in */}
            <section className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl bg-primary p-8 text-primary-foreground sm:flex-row sm:items-center sm:p-11">
                <div>
                    <h2 className="max-w-[22ch] text-2xl font-bold">Από τη θεωρία, στον δήμο σου.</h2>
                    <p className="mt-2 max-w-[46ch] text-primary-foreground/70">
                        Διάβασες τι είναι ένα δημοτικό συμβούλιο. Τώρα δες το πραγματικό: συνεδριάσεις, αποφάσεις
                        και θέματα του δήμου σου, με βίντεο και πρακτικά.
                    </p>
                </div>
                <Button asChild size="lg" className="shrink-0">
                    <Link href="/athens" className="unstyled">
                        Εξερεύνησε τα συμβούλια
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </section>
        </div>
    );
}
