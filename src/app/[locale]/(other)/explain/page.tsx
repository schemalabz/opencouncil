import { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { HeadingAnchor } from "@/components/explain/HeadingAnchor";
import { NeighborhoodIllustration } from "@/components/explain/NeighborhoodIllustration";
import { getNeighborhoodSubjects } from "@/lib/db/neighborhood";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";
import { getRealm } from "@/lib/realm.server";
import { ARTICLES, SECTIONS } from "@/lib/explain/articles";
import { OPENCOUNCIL_SUBSECTIONS } from "@/lib/explain/subsections";
import { ExplainReader } from "./ExplainReader";
import { ExplainFeatures } from "./ExplainFeatures";
import { SubstackCarousel } from "@/components/embeds/SubstackCarousel";
import { SUBSTACK_POSTS } from "@/lib/explain/substackPosts";

/** Full scroll-spy / mobile-nav order: articles, the OpenCouncil sub-sections,
 *  then the Substack "further reading" carousel as the final stop. */
const SUBSTACK_HEADING = "Διάβασε περισσότερα στο Substack";
const NAV_SECTIONS = [
    ...SECTIONS,
    ...OPENCOUNCIL_SUBSECTIONS,
    { id: "substack", title: SUBSTACK_HEADING },
];

const PAGE_TITLE = "Η τοπική αυτοδιοίκηση, απλά";
const PAGE_DESCRIPTION =
    "Πώς λειτουργούν οι δήμοι στην Ελλάδα — έσοδα, όργανα, συνεδριάσεις και αποφάσεις — και πώς το OpenCouncil τα κάνει κατανοητά, αναζητήσιμα και προσβάσιμα.";

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;

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
        },
        twitter: {
            card: "summary_large_image",
            title: PAGE_TITLE,
            description: PAGE_DESCRIPTION,
        },
        alternates: await buildHreflangAlternates("/explain", locale),
    };
}

export default async function ExplainPage() {
    const realm = await getRealm();
    const neighborhoodSubjects = await getNeighborhoodSubjects();
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        about: "Τοπική αυτοδιοίκηση",
        inLanguage: "el",
        author: { "@type": "Organization", name: "OpenCouncil" },
        publisher: { "@type": "Organization", name: "OpenCouncil" },
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
                <span>Σχετικά με την τοπική αυτοδιοίκηση</span>
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
                    <ol className="space-y-0.5">
                        {SECTIONS.map((s) => {
                            const isOc = s.id === "opencouncil";
                            return (
                                <li key={s.id} className={isOc ? "group" : undefined} data-toc-group={isOc ? "" : undefined}>
                                    <a
                                        href={`#${s.id}`}
                                        className="flex items-center justify-between gap-2 border-l-2 border-border py-1.5 pl-3.5 pr-1 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:border-orange aria-[current=true]:font-semibold aria-[current=true]:text-orange"
                                    >
                                        <span>{s.title}</span>
                                        {isOc && (
                                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-data-[expanded=true]:rotate-90" />
                                        )}
                                    </a>
                                    {/* nested sub-sections — revealed when the section is active */}
                                    {isOc && (
                                        <div
                                            data-toc-nested
                                            className="grid grid-rows-[0fr] overflow-hidden transition-[grid-template-rows] duration-300 ease-out group-data-[expanded=true]:grid-rows-[1fr]"
                                        >
                                            <ol className="mt-1 min-h-0 space-y-0.5 overflow-hidden pl-2">
                                                {OPENCOUNCIL_SUBSECTIONS.map((sub) => (
                                                    <li key={sub.id}>
                                                        <a
                                                            href={`#${sub.id}`}
                                                            className="block border-l-2 border-border py-1 pl-3 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:border-orange/50 aria-[current=true]:font-medium aria-[current=true]:text-orange/80"
                                                        >
                                                            {sub.title}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </aside>

                {/* articles */}
                <div className="space-y-14">
                    {ARTICLES.map(({ id, title, Body }) => (
                        <section key={id} id={id} className="scroll-mt-24">
                            <h2 className="!text-left text-2xl font-bold !leading-none sm:text-3xl">
                                <HeadingAnchor id={id}>{title}</HeadingAnchor>
                            </h2>
                            <div className="prose prose-neutral mt-4 max-w-none prose-headings:font-bold prose-a:text-orange prose-blockquote:border-l-orange prose-blockquote:not-italic">
                                <Body />
                            </div>
                            {/* Product showcase (diagram + feature demos), reused from
                                /about — part of the OpenCouncil section, matching its width */}
                            {id === "opencouncil" && <ExplainFeatures realm={realm} />}
                        </section>
                    ))}
                </div>
            </div>

            {/* Further reading — OpenCouncil Substack posts */}
            <hr className="mt-16 border-t border-border" />
            <SubstackCarousel id="substack" posts={SUBSTACK_POSTS} heading={SUBSTACK_HEADING} />

            <ExplainReader sections={NAV_SECTIONS} />
        </div>
    );
}
