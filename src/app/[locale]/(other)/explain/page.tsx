import { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { HeadingAnchor } from "@/components/explain/HeadingAnchor";
import { NeighborhoodIllustration } from "@/components/explain/NeighborhoodIllustration";
import { getNeighborhoodSubjects } from "@/lib/db/neighborhood";
import { getCityCoverageCached } from "@/lib/cache/queries";
import {
    PLATFORM_PRICING_TIERS,
    SESSION_PROCESSING,
    getCorrectnessPricing,
    CURRENT_OFFER_VERSION,
} from "@/lib/pricing/config";
import type { ExplainPricing } from "./ExplainFeatures";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getRealmBaseUrl } from "@/lib/realm";
import { getRealm } from "@/lib/realm.server";
import { ARTICLES, SECTIONS } from "@/lib/explain/articles";
import { OPENCOUNCIL_SUBSECTIONS } from "@/lib/explain/subsections";
import { ExplainReader } from "./ExplainReader";
import { ExplainFeatures } from "./ExplainFeatures";
import { SubstackCarousel } from "@/components/embeds/SubstackCarousel";
import { SUBSTACK_POSTS } from "@/lib/explain/substackPosts";

const SUBSTACK_HEADING = "Διάβασε περισσότερα στο Substack";

// Two high-level parts: the local-government articles nested under "Οι ελληνικοί
// δήμοι", and the OpenCouncil product (with its sub-sections). The part titles
// double as the top-level table-of-contents groups.
const GREEK_MUNICIPALITIES_TITLE = "Οι ελληνικοί δήμοι";
const OPENCOUNCIL_TITLE = "Πώς δουλεύει το OpenCouncil";

const LOCAL_GOV_SECTIONS = SECTIONS.filter((s) => s.id !== "opencouncil");
const LOCAL_GOV_ARTICLES = ARTICLES.filter((a) => a.id !== "opencouncil");
const OpenCouncilBody = ARTICLES.find((a) => a.id === "opencouncil")?.Body;

/** Top-level ToC groups, each with its nested sections. */
const NAV_GROUPS = [
    { id: "greek-municipalities", title: GREEK_MUNICIPALITIES_TITLE, items: LOCAL_GOV_SECTIONS },
    { id: "opencouncil", title: OPENCOUNCIL_TITLE, items: OPENCOUNCIL_SUBSECTIONS },
];

/** Full scroll-spy / mobile-nav order (top → bottom of the page). */
const NAV_SECTIONS = [
    { id: "greek-municipalities", title: GREEK_MUNICIPALITIES_TITLE },
    ...LOCAL_GOV_SECTIONS,
    { id: "opencouncil", title: OPENCOUNCIL_TITLE },
    ...OPENCOUNCIL_SUBSECTIONS,
    { id: "substack", title: SUBSTACK_HEADING },
];

/** Each nested section → its top-level part title (for the mobile sticky header). */
const SECTION_PARENTS: Record<string, string> = {
    ...Object.fromEntries(LOCAL_GOV_SECTIONS.map((s) => [s.id, GREEK_MUNICIPALITIES_TITLE])),
    ...Object.fromEntries(OPENCOUNCIL_SUBSECTIONS.map((s) => [s.id, OPENCOUNCIL_TITLE])),
};

const PAGE_TITLE = "Η τοπική αυτοδιοίκηση, απλά";
/** Shown in the visible breadcrumb nav and mirrored in the BreadcrumbList JSON-LD. */
const BREADCRUMB_LABEL = "Σχετικά με την τοπική αυτοδιοίκηση";
const PAGE_DESCRIPTION =
    "Πώς λειτουργούν οι δήμοι στην Ελλάδα — έσοδα, όργανα, συνεδριάσεις και αποφάσεις — και πώς το OpenCouncil τα κάνει κατανοητά, αναζητήσιμα και προσβάσιμα.";

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;

    const ogImageUrl = "/api/og?pageType=explain";

    return {
        title: `${PAGE_TITLE} | OpenCouncil`,
        description: PAGE_DESCRIPTION,
        keywords: [
            "τοπική αυτοδιοίκηση",
            "δήμοι Ελλάδα",
            "δημοτικό συμβούλιο",
            "δημοτική επιτροπή",
            "δημοτικές κοινότητες",
            "Διαύγεια",
            "δημοτικές εκλογές 2028",
            "OpenCouncil",
        ],
        authors: [{ name: "OpenCouncil" }],
        openGraph: {
            title: PAGE_TITLE,
            description: PAGE_DESCRIPTION,
            type: "article",
            siteName: "OpenCouncil",
            locale: locale === "en" ? "en_US" : "el_GR",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: PAGE_TITLE,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: PAGE_TITLE,
            description: PAGE_DESCRIPTION,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates("/explain"),
    };
}

export default async function ExplainPage() {
    const realm = await getRealm();
    const neighborhoodSubjects = await getNeighborhoodSubjects();
    const cityCoverage = await getCityCoverageCached(realm);

    // Pricing shown in "Ποιος πληρώνει" — derived from the pricing config so it
    // stays in sync with offers. Per-hour = digitization + human review; the
    // subscription spans the cheapest platform tier to the priciest.
    const cheapestTier = PLATFORM_PRICING_TIERS[0];
    const priciestTier = PLATFORM_PRICING_TIERS[PLATFORM_PRICING_TIERS.length - 1];
    const pricing: ExplainPricing = {
        perHour: SESSION_PROCESSING.pricePerHour + getCorrectnessPricing(CURRENT_OFFER_VERSION).pricePerUnit,
        cheapestMonthly: cheapestTier.monthlyPrice,
        cheapestUpTo: cheapestTier.maxPopulation,
        topMonthly: priciestTier.monthlyPrice,
        // the priciest (open-ended) tier kicks in above the previous tier's ceiling
        topFrom: PLATFORM_PRICING_TIERS[PLATFORM_PRICING_TIERS.length - 2]?.maxPopulation ?? null,
    };
    // Canonical, realm-scoped URL — the JSON-LD must reference the same URL the
    // page canonicalizes to, so search engines tie the structured data to the
    // indexed document (fragments are never separate index entries).
    const baseUrl = getRealmBaseUrl(realm);
    const pageUrl = `${baseUrl}/explain`;
    const organization = {
        "@type": "Organization",
        name: "OpenCouncil",
        url: baseUrl,
        logo: { "@type": "ImageObject", url: `${baseUrl}/logo.png` },
    };
    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "@id": `${pageUrl}#article`,
                mainEntityOfPage: pageUrl,
                url: pageUrl,
                headline: PAGE_TITLE,
                description: PAGE_DESCRIPTION,
                image: `${baseUrl}/api/og?pageType=explain`,
                about: "Τοπική αυτοδιοίκηση",
                inLanguage: "el",
                author: organization,
                publisher: organization,
            },
            // Mirrors the visual breadcrumb so results can show the site hierarchy.
            {
                "@type": "BreadcrumbList",
                "@id": `${pageUrl}#breadcrumb`,
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Αρχική", item: baseUrl },
                    { "@type": "ListItem", position: 2, name: BREADCRUMB_LABEL, item: pageUrl },
                ],
            },
        ],
    };

    return (
        <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:pb-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />

            {/* breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="breadcrumb">
                <Link href="/" className="hover:text-orange">
                    Αρχική
                </Link>
                <span className="text-border">/</span>
                <span>{BREADCRUMB_LABEL}</span>
            </nav>

            {/* title + description */}
            <header className="mt-5 max-w-3xl">
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{PAGE_TITLE}</h1>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{PAGE_DESCRIPTION}</p>
            </header>

            {/* interactive hero — a neighbourhood whose elements reveal real subjects */}
            <NeighborhoodIllustration subjects={neighborhoodSubjects} />

            <div className="mt-12 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12 lg:items-start">
                {/* table of contents (desktop) — pinned via ExplainReader, since a
                    parent layout uses overflow-hidden which breaks position: sticky */}
                <aside
                    className="hidden self-start lg:block lg:will-change-transform"
                    data-toc
                    aria-label="Περιεχόμενα"
                >
                    <h2 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground !text-left">
                        Περιεχόμενα
                    </h2>
                    <ol className="space-y-5">
                        {NAV_GROUPS.map((g) => (
                            <li key={g.id} data-toc-group={g.id}>
                                <a
                                    href={`#${g.id}`}
                                    data-toc-grouphead
                                    className="block py-1 text-sm font-bold text-foreground/80 transition-colors hover:text-orange aria-[current=true]:text-orange"
                                >
                                    {g.title}
                                </a>
                                <ol className="mt-1.5 space-y-0.5">
                                    {g.items.map((it) => (
                                        <li key={it.id}>
                                            <a
                                                href={`#${it.id}`}
                                                className="block border-l-2 border-border py-1.5 pl-3.5 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:border-orange aria-[current=true]:font-semibold aria-[current=true]:text-orange"
                                            >
                                                {it.title}
                                            </a>
                                        </li>
                                    ))}
                                </ol>
                            </li>
                        ))}
                    </ol>
                </aside>

                {/* two high-level parts */}
                <div className="space-y-16">
                    {/* Part 1 — Οι ελληνικοί δήμοι */}
                    <section aria-labelledby="greek-municipalities">
                        <h2
                            id="greek-municipalities"
                            className="!text-left scroll-mt-24 !text-3xl !font-bold tracking-tight sm:!text-4xl"
                        >
                            <HeadingAnchor id="greek-municipalities">{GREEK_MUNICIPALITIES_TITLE}</HeadingAnchor>
                        </h2>
                        <div className="mt-8 space-y-14">
                            {LOCAL_GOV_ARTICLES.map(({ id, title, Body }) => (
                                <section key={id} id={id} className="scroll-mt-24">
                                    <h3 className="!text-left text-xl font-normal !leading-none sm:text-2xl">
                                        <HeadingAnchor id={id}>{title}</HeadingAnchor>
                                    </h3>
                                    <div className="prose prose-neutral mt-4 max-w-none prose-headings:font-bold prose-a:text-orange prose-blockquote:border-l-orange prose-blockquote:not-italic">
                                        <Body />
                                    </div>
                                </section>
                            ))}
                        </div>
                    </section>

                    {/* Part 2 — Πώς δουλεύει το OpenCouncil */}
                    <section aria-labelledby="opencouncil">
                        <h2
                            id="opencouncil"
                            className="!text-left scroll-mt-24 !text-3xl !font-bold tracking-tight sm:!text-4xl"
                        >
                            <HeadingAnchor id="opencouncil">{OPENCOUNCIL_TITLE}</HeadingAnchor>
                        </h2>
                        {OpenCouncilBody && (
                            <div className="prose prose-neutral mt-8 max-w-none prose-headings:font-bold prose-a:text-orange prose-blockquote:border-l-orange prose-blockquote:not-italic">
                                <OpenCouncilBody />
                            </div>
                        )}
                        {/* Product showcase (diagram + feature demos + coverage/pricing/CTA) */}
                        <ExplainFeatures realm={realm} coverage={cityCoverage} pricing={pricing} />
                    </section>
                </div>
            </div>

            {/* Further reading — OpenCouncil Substack posts */}
            <hr className="mt-16 border-t border-border" />
            <SubstackCarousel id="substack" posts={SUBSTACK_POSTS} heading={SUBSTACK_HEADING} />

            <ExplainReader sections={NAV_SECTIONS} sectionParents={SECTION_PARENTS} mainTitle={PAGE_TITLE} />
        </div>
    );
}
