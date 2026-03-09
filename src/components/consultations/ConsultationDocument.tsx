"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, ChevronDown, ChevronUp, FileTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import ChapterView from "./ChapterView";
import ArticleView from "./ArticleView";
import DocumentNavigation from "./DocumentNavigation";
import SourcesList from "./SourcesList";
import MarkdownContent from "./MarkdownContent";
import { RegulationData, ReferenceFormat, CurrentUser } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface ConsultationDocumentProps {
    regulationData: RegulationData | null;
    baseUrl: string; // Base URL for permalinks
    className?: string;
    expandedChapters?: Set<string>;
    expandedArticles?: Set<string>;
    onToggleChapter?: (chapterId: string) => void;
    onToggleArticle?: (articleId: string) => void;
    onReferenceClick?: (referenceId: string) => void; // Navigation callback from parent
    comments?: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId?: string;
    cityId?: string;
    consultationIsActive?: boolean; // Add consultation active status
}

interface SummaryCardProps {
    summary: string;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    className?: string;
}

function SummaryCard({ summary, referenceFormat, onReferenceClick, regulationData, className }: SummaryCardProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Card className={cn("mb-6", className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between w-full hover:bg-muted/50 rounded-md p-4 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <FileTextIcon className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                                <span className="text-sm md:text-md font-bold">
                                    Σύνοψη κανονισμού με ΑΙ
                                </span>
                            </div>
                            <div className="inline-flex items-center gap-1 text-xs font-medium relative overflow-hidden rounded-md px-2 py-1">
                                <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-20"></span>
                                <span className="relative z-10 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    Ξεκινήστε εδώ
                                </span>
                            </div>
                        </div>
                        <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isOpen && "rotate-180"
                        )} />
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent className="px-4 pb-4">
                    <MarkdownContent
                        content={summary}
                        referenceFormat={referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                        className="text-sm leading-relaxed"
                    />
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

export default function ConsultationDocument({
    regulationData,
    baseUrl,
    className = "",
    expandedChapters = new Set(),
    expandedArticles = new Set(),
    onToggleChapter = () => { },
    onToggleArticle = () => { },
    onReferenceClick,
    comments,
    currentUser,
    consultationId,
    cityId,
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
                {/* Summary Card */}
                {regulationData.summary && (
                    <SummaryCard
                        summary={regulationData.summary}
                        referenceFormat={regulationData.referenceFormat}
                        onReferenceClick={handleReferenceClick}
                        regulationData={regulationData}
                    />
                )}

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
                            baseUrl={baseUrl}
                            isExpanded={expandedChapters.has(chapter.id)}
                            onToggle={() => onToggleChapter(chapter.id)}
                            expandedArticles={expandedArticles}
                            onToggleArticle={onToggleArticle}
                            referenceFormat={regulationData.referenceFormat}
                            onReferenceClick={handleReferenceClick}
                            regulationData={regulationData}
                            comments={comments}
                            currentUser={currentUser}
                            consultationId={consultationId}
                            cityId={cityId}
                            consultationIsActive={consultationIsActive}
                        >
                            {chapter.articles?.map((article) => (
                                <ArticleView
                                    key={article.id}
                                    article={article}
                                    baseUrl={baseUrl}
                                    isExpanded={expandedArticles.has(article.id)}
                                    onToggle={() => onToggleArticle(article.id)}
                                    referenceFormat={regulationData.referenceFormat}
                                    onReferenceClick={handleReferenceClick}
                                    regulationData={regulationData}
                                    comments={comments}
                                    currentUser={currentUser}
                                    consultationId={consultationId}
                                    cityId={cityId}
                                    consultationIsActive={consultationIsActive}
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
                    />
                </div>
            </div>
        </div>
    );
} 