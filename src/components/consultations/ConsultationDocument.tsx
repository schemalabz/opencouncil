"use client";

import type { Realm } from "@prisma/client";
import { cn } from "@/lib/utils";
import ChapterView from "./ChapterView";
import ArticleView from "./ArticleView";
import SourcesList from "./SourcesList";
import type { RegulationData, RegulationItem } from "./types";
import { cardClass, headingClass, SectionLabel, textLinkClass, ViewLink } from "./views/ui";
import { documentWording } from "./wording";

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
    /** The chapter or article the reader came for, marked in the contents and in the text. */
    currentEntityId?: string | null;
    /**
     * The text fills a pane beside the consultation's panel, not the page: the contents column
     * shows only where the pane is wide enough for it, and sticks to the top of the pane.
     */
    inPane?: boolean;
    consultationId?: string;
    cityId?: string;
    /** the request's realm, resolved server-side — picks the support phone number */
    realm: Realm;
    consultationIsActive?: boolean;
}

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
    inPane = false,
    consultationId,
    cityId,
    realm,
    consultationIsActive = true,
}: ConsultationDocumentProps) {
    const wording = documentWording(regulationData?.documentType);
    if (!regulationData) {
        return <p className={cn(cardClass, "m-4 p-5 text-[17px] text-stone-700")}>{wording.loadFailed}</p>;
    }

    const chapters = regulationData.regulation.filter(item => item.type === 'chapter' && item.articles);
    if (chapters.length === 0) {
        return <p className={cn(cardClass, "m-4 p-5 text-[17px] text-stone-700")}>{wording.empty}</p>;
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
            <nav aria-label="Περιεχόμενα" className={cn("hidden w-[280px] shrink-0", inPane ? "2xl:block" : "lg:block")}>
                {/* The site's header stays on top while the page scrolls; the contents sit under it. */}
                <div className={cn("sticky flex flex-col gap-0.5", inPane ? "top-7" : "top-24")}>
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
                            <span className="text-[13px] text-stone-500">{wording.chapterLabel(chapter.num)}</span>
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
                {/* A page has the screen's title above the text; a pane has none, so it names itself. */}
                {inPane && <h2 className={cn(headingClass, "px-1 !text-xl")}>{wording.documentTitle}</h2>}
                <div className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-[15px] text-stone-600">{wording.chapterCount(chapters.length)}{articleCount > 0 && ` · ${wording.articleCount(articleCount)}`}</span>
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
                        wording={wording}
                        commentCount={commentCount([chapter.id, ...articleIds(chapter)])}
                        ownCommentCount={commentCount([chapter.id])}
                        commentHref={commentHref(chapter.id)}
                        active={consultationIsActive}
                        isCurrent={inPane && chapter.id === currentEntityId}
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
                                wording={wording}
                                chapterNum={chapter.num}
                                commentCount={commentCount([article.id])}
                                commentHref={commentHref(article.id)}
                                active={consultationIsActive}
                                isCurrent={inPane && article.id === currentEntityId}
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
