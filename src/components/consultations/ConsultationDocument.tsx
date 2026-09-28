"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import ChapterView from "./ChapterView";
import ArticleView from "./ArticleView";
import DocumentNavigation from "./DocumentNavigation";
import SourcesList from "./SourcesList";
import { RegulationData } from "./types";
import type { Realm } from "@prisma/client";

interface ConsultationDocumentProps {
    regulationData: RegulationData | null;
    className?: string;
    expandedChapters?: Set<string>;
    expandedArticles?: Set<string>;
    onToggleChapter?: (chapterId: string) => void;
    onToggleArticle?: (articleId: string) => void;
    onReferenceClick?: (referenceId: string) => void; // Navigation callback from parent
    commentCount: (entityIds: string[]) => number;
    commentHref: (entityId: string) => string;
    consultationId?: string;
    cityId?: string;
    /** the request's realm, resolved server-side — picks the support phone number */
    realm: Realm;
    consultationIsActive?: boolean;
    /** "Δήμος Χ", for the sources footer */
    municipalityName?: string;
}

export default function ConsultationDocument({
    regulationData,
    className = "",
    expandedChapters = new Set(),
    expandedArticles = new Set(),
    onToggleChapter = () => { },
    onToggleArticle = () => { },
    onReferenceClick,
    commentCount,
    commentHref,
    consultationId,
    cityId,
    realm,
    municipalityName,
    consultationIsActive = true // Default to true for backward compatibility
}: ConsultationDocumentProps) {

    // Use the passed-down reference click handler or fallback to console.log
    const handleReferenceClick = onReferenceClick || ((referenceId: string) => {
        console.log('Reference clicked:', referenceId);
    });
    if (!regulationData) {
        return (
            <div className={`flex items-center justify-center min-h-96 ${className}`}>
                <Card className="w-full max-w-lg">
                    <CardContent className="p-6">
                        <div className="text-center py-8">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Δεν ήταν δυνατή η φόρτωση του κανονισμού</h3>
                            <p className="text-muted-foreground">
                                Υπάρχει πρόβλημα με τη φόρτωση του περιεχομένου.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const chapters = regulationData.regulation.filter(item => item.type === 'chapter');

    // Calculate if all chapters and articles are expanded
    const allChapterIds = chapters.map(chapter => chapter.id);
    const allArticleIds = chapters.flatMap(chapter => chapter.articles?.map(article => article.id) || []);

    const allChaptersExpanded = allChapterIds.every(id => expandedChapters.has(id));
    const allArticlesExpanded = allArticleIds.every(id => expandedArticles.has(id));
    const allExpanded = allChaptersExpanded && allArticlesExpanded;

    // Function to expand or collapse all
    const handleExpandCollapseAll = () => {
        if (allExpanded) {
            // Collapse all
            allChapterIds.forEach(chapterId => {
                if (expandedChapters.has(chapterId)) {
                    onToggleChapter(chapterId);
                }
            });
            allArticleIds.forEach(articleId => {
                if (expandedArticles.has(articleId)) {
                    onToggleArticle(articleId);
                }
            });
        } else {
            // Expand all
            allChapterIds.forEach(chapterId => {
                if (!expandedChapters.has(chapterId)) {
                    onToggleChapter(chapterId);
                }
            });
            allArticleIds.forEach(articleId => {
                if (!expandedArticles.has(articleId)) {
                    onToggleArticle(articleId);
                }
            });
        }
    };

    if (chapters.length === 0) {
        return (
            <div className={`flex items-center justify-center min-h-96 ${className}`}>
                <Card className="w-full max-w-lg">
                    <CardContent className="p-6">
                        <div className="text-center py-8">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Δεν βρέθηκε περιεχόμενο</h3>
                            <p className="text-muted-foreground">
                                Ο κανονισμός δεν περιέχει κεφάλαια προς εμφάνιση.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className={className}>
            {/* Document Navigation - only on large screens */}
            <DocumentNavigation regulationData={regulationData} />

            <div className="container mx-auto px-3 md:px-4 py-4 md:py-12 max-w-4xl">
                {/* Expand/Collapse All Button */}
                <div className="flex justify-center mb-6">
                    <Button
                        onClick={handleExpandCollapseAll}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        {allExpanded ? (
                            <>
                                <ChevronUp className="h-4 w-4" />
                                Σύμπτυξη όλων
                            </>
                        ) : (
                            <>
                                <ChevronDown className="h-4 w-4" />
                                Επέκταση όλων
                            </>
                        )}
                    </Button>
                </div>

                <div>
                    {chapters.map((chapter) => (
                        <ChapterView
                            key={chapter.id}
                            chapter={chapter}
                            isExpanded={expandedChapters.has(chapter.id)}
                            onToggle={() => onToggleChapter(chapter.id)}
                            referenceFormat={regulationData.referenceFormat}
                            onReferenceClick={handleReferenceClick}
                            regulationData={regulationData}
                            commentCount={commentCount([chapter.id, ...(chapter.articles ?? []).map(article => article.id)])}
                            commentHref={commentHref(chapter.id)}
                            active={consultationIsActive}
                        >
                            {chapter.articles?.map((article) => (
                                <ArticleView
                                    key={article.id}
                                    article={article}
                                    isExpanded={expandedArticles.has(article.id)}
                                    onToggle={() => onToggleArticle(article.id)}
                                    referenceFormat={regulationData.referenceFormat}
                                    onReferenceClick={handleReferenceClick}
                                    regulationData={regulationData}
                                    commentCount={commentCount([article.id])}
                                    commentHref={commentHref(article.id)}
                                    active={consultationIsActive}
                                />
                            ))}
                        </ChapterView>
                    ))}

                    {/* Sources and Contact Information */}
                    <SourcesList
                        sources={regulationData.sources}
                        contactEmail={regulationData.contactEmail}
                        ccEmails={regulationData.ccEmails}
                        consultationId={consultationId}
                        cityId={cityId}
                        municipalityName={municipalityName}
                        realm={realm}
                    />
                </div>
            </div>
        </div>
    );
} 