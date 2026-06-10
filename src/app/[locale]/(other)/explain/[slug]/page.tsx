import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Plus, Zap } from "lucide-react";
import { env } from "@/env.mjs";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getArticle, PUBLISHED_ARTICLE_SLUGS } from "@/lib/explain/articles";
import { ImagePlaceholder } from "../ImagePlaceholder";
import { ArticleInteractions } from "./ArticleInteractions";
import { ARTICLE_BODIES } from "./bodies";

export function generateStaticParams() {
    return PUBLISHED_ARTICLE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
    params: { slug, locale },
}: {
    params: { slug: string; locale: string };
}): Promise<Metadata> {
    const article = getArticle(slug);
    if (!article) {
        return {
            title: "Το άρθρο δεν βρέθηκε | OpenCouncil",
            description: "Το άρθρο που αναζητάτε δεν είναι διαθέσιμο.",
        };
    }

    const ogImageUrl = `${env.NEXTAUTH_URL}/api/og?pageType=search`;

    return {
        title: `${article.title} — Εξήγησε | OpenCouncil`,
        description: article.description,
        keywords: [article.title, "τοπική αυτοδιοίκηση", "δημοτικό συμβούλιο", "OpenCouncil"],
        authors: [{ name: "OpenCouncil" }],
        openGraph: {
            title: article.title,
            description: article.description,
            type: "article",
            siteName: "OpenCouncil",
            images: [{ url: ogImageUrl, width: 1200, height: 630, alt: article.title }],
            locale: locale === "en" ? "en_US" : "el_GR",
        },
        twitter: {
            card: "summary_large_image",
            title: article.title,
            description: article.description,
            images: [ogImageUrl],
        },
        alternates: buildHreflangAlternates(`/explain/${slug}`, locale),
    };
}

const chipClass =
    "unstyled rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-orange hover:text-orange";

export default function ExplainArticlePage({ params: { slug } }: { params: { slug: string } }) {
    const article = getArticle(slug);
    const Body = ARTICLE_BODIES[slug];
    if (!article || !Body) {
        notFound();
    }

    const pageUrl = `${env.NEXTAUTH_URL}/explain/${slug}`;
    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                headline: article.title,
                description: article.description,
                about: "Τοπική αυτοδιοίκηση",
                inLanguage: "el",
                isPartOf: {
                    "@type": "CollectionPage",
                    name: "Λεξικό της αυτοδιοίκησης",
                    url: `${env.NEXTAUTH_URL}/explain`,
                },
                mainEntityOfPage: pageUrl,
                author: { "@type": "Organization", name: "OpenCouncil" },
                publisher: { "@type": "Organization", name: "OpenCouncil" },
            },
            {
                "@type": "FAQPage",
                mainEntity: article.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.question,
                    acceptedAnswer: { "@type": "Answer", text: f.answer },
                })),
            },
        ],
    };

    return (
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" data-article>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
            <ArticleInteractions />

            <header className="pt-8">
                <nav className="mb-5 flex items-center gap-2 text-sm text-muted-foreground" aria-label="breadcrumb">
                    <Link href="/" className="hover:text-orange">
                        Αρχική
                    </Link>
                    <span className="text-border">/</span>
                    <Link href="/explain" className="hover:text-orange">
                        Εξήγησε
                    </Link>
                    <span className="text-border">/</span>
                    <span className="truncate">{article.title}</span>
                </nav>
                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-orange">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                    {article.categoryLabel}
                </p>
                <h1 className="mt-4 max-w-[18ch] text-3xl font-bold tracking-tight sm:text-4xl">
                    {article.title}
                </h1>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2 font-medium text-foreground/80">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange/10 text-xs font-bold text-orange ring-1 ring-orange/20">
                            OC
                        </span>
                        Συντακτική ομάδα OpenCouncil
                    </span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>Ενημερώθηκε: {article.updated}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>{article.readingMinutes} λεπτά ανάγνωση</span>
                </div>
            </header>

            <figure className="mt-7">
                <ImagePlaceholder
                    src={article.image}
                    alt={article.title}
                    className="h-56 w-full rounded-2xl sm:h-72 md:h-80"
                />
            </figure>

            <div className="mt-8 grid gap-10 lg:grid-cols-[200px_minmax(0,720px)_1fr] lg:items-start">
                {/* table of contents */}
                <aside className="hidden lg:sticky lg:top-24 lg:block" data-toc aria-label="Περιεχόμενα">
                    <h4 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Σε αυτό το άρθρο
                    </h4>
                    <ol className="space-y-0.5">
                        {article.toc.map((entry) => (
                            <li key={entry.id}>
                                <a
                                    href={`#${entry.id}`}
                                    className="block border-l-2 border-border py-1.5 pl-3.5 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:border-orange aria-[current=true]:font-semibold aria-[current=true]:text-orange"
                                >
                                    {entry.label}
                                </a>
                            </li>
                        ))}
                    </ol>
                </aside>

                {/* article body */}
                <article>
                    <div className="rounded-2xl border border-orange/30 bg-orange/5 p-6">
                        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange">
                            <Zap className="h-4 w-4" />
                            Σύντομη απάντηση
                        </div>
                        <p className="text-lg font-medium leading-relaxed text-foreground">{article.shortAnswer}</p>
                    </div>

                    <div className="prose prose-neutral mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:scroll-mt-24 prose-h2:text-2xl prose-a:text-orange">
                        <Body />
                    </div>
                </article>

                {/* sources rail */}
                <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
                    <Card>
                        <CardContent className="p-5">
                            <h4 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Πηγές &amp; νομοθεσία
                            </h4>
                            <ul className="space-y-3.5">
                                {article.sources.map((source, i) => (
                                    <li key={source.label} className="flex gap-3">
                                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-bold text-muted-foreground">
                                            {i + 1}
                                        </span>
                                        <div>
                                            {source.href ? (
                                                <a
                                                    href={source.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-semibold leading-tight hover:text-orange"
                                                >
                                                    {source.label}
                                                </a>
                                            ) : (
                                                <span className="text-sm font-semibold leading-tight">
                                                    {source.label}
                                                </span>
                                            )}
                                            <div className="mt-0.5 text-xs text-muted-foreground">{source.meta}</div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    <div className="rounded-lg bg-primary p-5 text-primary-foreground">
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-primary-foreground/60">
                            Δες το στην πράξη
                        </h4>
                        <p className="mb-3.5 text-sm leading-relaxed text-primary-foreground/80">
                            Βρες τις συνεδριάσεις του δήμου σου με βίντεο και πρακτικά.
                        </p>
                        <Button asChild size="sm" className="w-full">
                            <Link href="/athens" className="unstyled">
                                Εξερεύνησε τον δήμο σου
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </aside>
            </div>

            {/* FAQ */}
            <section className="mt-12 max-w-[940px]">
                <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">Συχνές ερωτήσεις</h2>
                <div className="rounded-xl border border-border bg-card px-5">
                    {article.faqs.map((faq, i) => (
                        <details key={faq.question} open={i === 0} className="group border-b border-border last:border-0">
                            <summary className="flex cursor-pointer list-none items-center gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                                {faq.question}
                                <Plus className="ml-auto h-5 w-5 shrink-0 text-orange transition-transform group-open:rotate-45" />
                            </summary>
                            <div className="pb-5 leading-relaxed text-muted-foreground">{faq.answer}</div>
                        </details>
                    ))}
                </div>
            </section>

            {/* related searches */}
            <section className="mt-10 max-w-[940px]">
                <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">Σχετικές αναζητήσεις</h2>
                <div className="flex flex-wrap gap-2.5">
                    {article.related.map((term) => (
                        <Link key={term} href={`/search?query=${encodeURIComponent(term)}`} className={chipClass}>
                            {term}
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
