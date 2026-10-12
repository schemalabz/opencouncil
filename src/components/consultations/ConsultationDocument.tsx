"use client";

import type { Realm } from "@prisma/client";
import { cn } from "@/lib/utils";
import ChapterView from "./ChapterView";
import ArticleView from "./ArticleView";
import SourcesList from "./SourcesList";
import type { RegulationData, RegulationItem } from "./types";
import { cardClass, SectionLabel, textLinkClass, ViewLink } from "./views/ui";

interface ConsultationDocumentProps {
    regulationData: RegulationData | null;
    expandedChapters?: Set<string>;
    expandedArticles?: Set<string>;
    onToggleChapter?: (chapterId: string) => void;
    onToggleArticle?: (articleId: string) => void;
    onReferenceClick?: (referenceId: string) => void;
    commentCount: (entityIds: string[]) => number;
    commentHref: (entityId: string) => string;
    /** A link that opens a chapter and scrolls to it, for the contents column. */
    chapterHref: (chapterId: string) => string;
    /** The chapter or article the reader came for, marked in the contents. */
    currentEntityId?: string | null;
    consultationId?: string;
    cityId?: string;
    /** the request's realm, resolved server-side — picks the support phone number */
    realm: Realm;
    consultationIsActive?: boolean;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const tocButtonClass = "px-3.5 py-2 text-left text-[15px] font-semibold text-stone-900 hover:underline";

/** The full study: the chapters as cards, each a list of its articles, then the sources and the contact. */
export default function ConsultationDocument({
    regulationData,
    expandedChapters = new Set(),
    expandedArticles = new Set(),
    onToggleChapter = () => { },
    onToggleArticle = () => { },
    onReferenceClick,
    commentCount,
    commentHref,
    chapterHref,
    currentEntityId,
    consultationId,
    cityId,
    realm,
    consultationIsActive = true,
}: ConsultationDocumentProps) {
    if (!regulationData) {
        return <p className={cn(cardClass, "m-4 p-5 text-[17px] text-stone-700")}>Δεν ήταν δυνατή η φόρτωση της μελέτης. Δοκιμάστε ξανά σε λίγο.</p>;
    }

    const chapters = regulationData.regulation.filter(item => item.type === 'chapter' && item.articles);
    if (chapters.length === 0) {
        return <p className={cn(cardClass, "m-4 p-5 text-[17px] text-stone-700")}>Η μελέτη δεν έχει κεφάλαια.</p>;
    }

    const articleIds = (chapter: RegulationItem) => chapter.articles?.map(article => article.id) ?? [];
    const articleCount = chapters.reduce((sum, chapter) => sum + articleIds(chapter).length, 0);
    const allExpanded = chapters.every(chapter =>
        expandedChapters.has(chapter.id) && articleIds(chapter).every(id => expandedArticles.has(id))
    );
    const toggleAll = () => {
        for (const chapter of chapters) {
            if (expandedChapters.has(chapter.id) === allExpanded) onToggleChapter(chapter.id);
            for (const id of articleIds(chapter)) {
                if (expandedArticles.has(id) === allExpanded) onToggleArticle(id);
            }
        }
    };
    const isCurrent = (chapter: RegulationItem) =>
        chapter.id === currentEntityId || articleIds(chapter).includes(currentEntityId ?? '');
    const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="mx-auto flex w-full max-w-[1120px] gap-8 px-4 pb-8 pt-4 lg:pt-7">
            {/* On a computer the contents stay beside the text; on a phone the cards are the contents. */}
            <nav aria-label="Περιεχόμενα" className="hidden w-[280px] shrink-0 lg:block">
                {/* The site's header stays on top while the page scrolls; the contents sit under it. */}
                <div className="sticky top-24 flex flex-col gap-0.5">
                    <SectionLabel>Περιεχόμενα</SectionLabel>
                    {chapters.map(chapter => (
                        <ViewLink
                            key={chapter.id}
                            href={chapterHref(chapter.id)}
                            className={cn(
                                "flex flex-col gap-0.5 rounded-r-xl border-l-[3px] border-transparent px-3.5 py-2.5 text-stone-900 hover:bg-white",
                                isCurrent(chapter) && "border-[#c2410c] bg-white"
                            )}
                        >
                            <span className="text-[13px] text-stone-500">Κεφάλαιο {chapter.num}</span>
                            <span className="text-[15px] font-semibold leading-snug">{chapter.title || chapter.name}</span>
                        </ViewLink>
                    ))}
                    {regulationData.sources.length > 0 && (
                        <button type="button" onClick={() => scrollTo('consultation-sources')} className={cn(tocButtonClass, "mt-2")}>Πηγές</button>
                    )}
                    <button type="button" onClick={() => scrollTo('consultation-contact')} className={tocButtonClass}>Επικοινωνία</button>
                </div>
            </nav>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-[15px] text-stone-600">{count(chapters.length, 'κεφάλαιο', 'κεφάλαια')} · {count(articleCount, 'άρθρο', 'άρθρα')}</span>
                    <button type="button" onClick={toggleAll} className={cn(textLinkClass, "text-[15px]")}>
                        {allExpanded ? 'Κλείσιμο όλων' : 'Άνοιγμα όλων'}
                    </button>
                </div>

                {chapters.map(chapter => (
                    <ChapterView
                        key={chapter.id}
                        chapter={chapter}
                        isExpanded={expandedChapters.has(chapter.id)}
                        onToggle={() => onToggleChapter(chapter.id)}
                        referenceFormat={regulationData.referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                        commentCount={commentCount([chapter.id, ...articleIds(chapter)])}
                        commentHref={commentHref(chapter.id)}
                        active={consultationIsActive}
                    >
                        {chapter.articles?.map(article => (
                            <ArticleView
                                key={article.id}
                                article={article}
                                isExpanded={expandedArticles.has(article.id)}
                                onToggle={() => onToggleArticle(article.id)}
                                referenceFormat={regulationData.referenceFormat}
                                onReferenceClick={onReferenceClick}
                                regulationData={regulationData}
                                commentCount={commentCount([article.id])}
                                commentHref={commentHref(article.id)}
                                active={consultationIsActive}
                            />
                        ))}
                    </ChapterView>
                ))}

                <SourcesList
                    sources={regulationData.sources}
                    contactEmail={regulationData.contactEmail}
                    ccEmails={regulationData.ccEmails}
                    consultationId={consultationId}
                    cityId={cityId}
                    realm={realm}
                />
            </div>
        </div>
    );
}
