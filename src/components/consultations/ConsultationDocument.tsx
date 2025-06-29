"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import ChapterView from "./ChapterView";
import ArticleView from "./ArticleView";
import DocumentNavigation from "./DocumentNavigation";
import { RegulationData } from "./types";

interface ConsultationDocumentProps {
    regulationData: RegulationData | null;
    baseUrl: string; // Base URL for permalinks
    className?: string;
    expandedChapters?: Set<string>;
    expandedArticles?: Set<string>;
    onToggleChapter?: (chapterId: string) => void;
    onToggleArticle?: (articleId: string) => void;
}

export default function ConsultationDocument({
    regulationData,
    baseUrl,
    className = "",
    expandedChapters = new Set(),
    expandedArticles = new Set(),
    onToggleChapter = () => { },
    onToggleArticle = () => { }
}: ConsultationDocumentProps) {
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
                        >
                            {chapter.articles?.map((article) => (
                                <ArticleView
                                    key={article.id}
                                    article={article}
                                    baseUrl={baseUrl}
                                    isExpanded={expandedArticles.has(article.id)}
                                    onToggle={() => onToggleArticle(article.id)}
                                />
                            ))}
                        </ChapterView>
                    ))}
                </div>
            </div>
        </div>
    );
} 