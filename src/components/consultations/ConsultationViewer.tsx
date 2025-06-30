"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConsultationHeader from "./ConsultationHeader";
import ConsultationMap from "./ConsultationMap";
import ConsultationDocument from "./ConsultationDocument";
import ViewToggleButton from "./ViewToggleButton";

import { RegulationData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

type ViewMode = 'map' | 'document';

interface Consultation {
    id: string;
    name: string;
    jsonUrl: string;
    endDate: Date;
    isActive: boolean;
}

interface ConsultationViewerProps {
    consultation: Consultation;
    regulationData: RegulationData | null;
    baseUrl: string; // Base URL for the consultation page (for permalinks)
    comments: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId: string;
    cityId: string;
}

export default function ConsultationViewer({
    consultation,
    regulationData,
    baseUrl,
    comments,
    currentUser,
    consultationId,
    cityId
}: ConsultationViewerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Default to document view, unless URL specifies map
    const [currentView, setCurrentView] = useState<ViewMode>('document');

    // Track which chapters and articles are expanded
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

    // Update view based on URL on mount and when search params change
    useEffect(() => {
        const viewParam = searchParams.get('view');
        if (viewParam === 'map' || viewParam === 'document') {
            setCurrentView(viewParam as ViewMode);
        } else {
            // Default to document view and update URL if no view param exists
            setCurrentView('document');
            if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                if (!params.has('view')) {
                    params.set('view', 'document');
                    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
                    router.replace(newUrl, { scroll: false });
                }
            }
        }
    }, [searchParams, router]);

    // Helper functions for managing expansion state
    const expandChapter = (chapterId: string) => {
        setExpandedChapters(prev => new Set(prev).add(chapterId));
    };

    const toggleChapter = (chapterId: string) => {
        setExpandedChapters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(chapterId)) {
                newSet.delete(chapterId);
            } else {
                newSet.add(chapterId);
            }
            return newSet;
        });
    };

    const expandArticle = (articleId: string) => {
        setExpandedArticles(prev => new Set(prev).add(articleId));
    };

    const toggleArticle = (articleId: string) => {
        setExpandedArticles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(articleId)) {
                newSet.delete(articleId);
            } else {
                newSet.add(articleId);
            }
            return newSet;
        });
    };

    // Find which chapter contains an article
    const findChapterForArticle = (articleId: string): string | null => {
        if (!regulationData) return null;

        for (const chapter of regulationData.regulation) {
            if (chapter.type === 'chapter' && chapter.articles) {
                for (const article of chapter.articles) {
                    if (article.id === articleId) {
                        return chapter.id;
                    }
                }
            }
        }
        return null;
    };

    // Handle initial hash on page load and actual hash changes
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash && hash.length > 1) {
                const targetId = hash.substring(1); // Remove #

                // Check if user explicitly set view=map in URL
                const urlParams = new URLSearchParams(window.location.search);
                const explicitView = urlParams.get('view');

                // Only auto-switch to document view if user hasn't explicitly chosen map view
                if (currentView === 'map' && explicitView !== 'map') {
                    setCurrentView('document');
                    // Update URL to reflect document view
                    const params = new URLSearchParams(window.location.search);
                    params.set('view', 'document');
                    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
                    router.replace(newUrl, { scroll: false });
                }

                // Only handle hash navigation if we're in document view or switching to it
                if (currentView === 'document' || explicitView !== 'map') {
                    // Determine what needs to be expanded
                    if (regulationData) {
                        // Check if it's a chapter
                        const chapter = regulationData.regulation.find(item =>
                            item.type === 'chapter' && item.id === targetId
                        );

                        if (chapter) {
                            // It's a chapter - expand it
                            expandChapter(targetId);
                        } else {
                            // Check if it's an article
                            const parentChapterId = findChapterForArticle(targetId);
                            if (parentChapterId) {
                                // It's an article - expand both the chapter and the article
                                expandChapter(parentChapterId);
                                expandArticle(targetId);
                            }
                        }
                    }

                    // Small delay to ensure content is rendered and expanded
                    setTimeout(() => {
                        const element = document.querySelector(hash);
                        if (element) {
                            element.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }
                    }, currentView === 'map' ? 500 : 200);
                }
            }
        };

        // Only handle initial hash on mount
        if (window.location.hash) {
            handleHashChange();
        }

        // Listen for actual hash changes
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []); // Remove dependencies to prevent running on every state change

    // Separate effect to handle hash when view changes to document
    useEffect(() => {
        if (currentView === 'document' && window.location.hash) {
            const hash = window.location.hash;
            const targetId = hash.substring(1);

            if (regulationData) {
                const chapter = regulationData.regulation.find(item =>
                    item.type === 'chapter' && item.id === targetId
                );

                if (chapter) {
                    expandChapter(targetId);
                } else {
                    const parentChapterId = findChapterForArticle(targetId);
                    if (parentChapterId) {
                        expandChapter(parentChapterId);
                        expandArticle(targetId);
                    }
                }
            }
        }
    }, [currentView, regulationData]); // Only run when view changes or regulation data loads

    const toggleView = () => {
        const newView = currentView === 'map' ? 'document' : 'map';
        setCurrentView(newView);

        // Update URL with new view
        const params = new URLSearchParams(window.location.search);
        params.set('view', newView);

        // If switching to map view, remove any hash (since anchors don't make sense in map view)
        const newUrl = newView === 'map'
            ? `${window.location.pathname}?${params.toString()}`
            : `${window.location.pathname}?${params.toString()}${window.location.hash}`;

        router.push(newUrl, { scroll: false });

        // Scroll to top when switching to map view (non-smoothly to hide footer)
        if (newView === 'map') {
            window.scrollTo(0, 0);
        }
    };

    // Handle reference navigation
    const handleReferenceClick = (referenceId: string) => {
        if (!regulationData) return;

        // Determine the type of reference
        let referenceType: 'chapter' | 'article' | 'geoset' | 'geometry' | null = null;

        for (const item of regulationData.regulation) {
            // Check if it's a chapter or geoset (direct match)
            if (item.id === referenceId) {
                referenceType = item.type === 'chapter' ? 'chapter' : 'geoset';
                break;
            }

            // Check articles within chapters
            if (item.type === 'chapter' && item.articles) {
                const article = item.articles.find(a => a.id === referenceId);
                if (article) {
                    referenceType = 'article';
                    break;
                }
            }

            // Check geometries within geosets
            if (item.type === 'geoset' && item.geometries) {
                const geometry = item.geometries.find(g => g.id === referenceId);
                if (geometry) {
                    referenceType = 'geometry';
                    break;
                }
            }
        }

        // Navigate based on reference type
        if (referenceType === 'chapter' || referenceType === 'article') {
            // Navigate to document section
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'document');
            const newUrl = `${window.location.pathname}?${params.toString()}#${referenceId}`;
            router.push(newUrl, { scroll: false });
        } else if (referenceType === 'geoset' || referenceType === 'geometry') {
            // Navigate to map view
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'map');
            const newUrl = `${window.location.pathname}?${params.toString()}#${referenceId}`;
            router.push(newUrl, { scroll: false });
        }
    };

    const title = regulationData?.title || consultation.name;
    const description = "Διαβούλευση για κανονισμό";

    if (currentView === 'map') {
        // Full-screen map view
        return (
            <div className="h-screen relative">


                {/* Full-screen map */}
                <div className="absolute inset-0">
                    <ConsultationMap
                        baseUrl={baseUrl}
                        className="w-full h-full"
                        regulationData={regulationData}
                        comments={comments}
                        currentUser={currentUser}
                        consultationId={consultationId}
                        cityId={cityId}
                    />
                </div>

                {/* Floating action button for view toggle */}
                <ViewToggleButton
                    currentView={currentView}
                    onToggle={toggleView}
                />
            </div>
        );
    }

    // Normal page layout for document view
    return (
        <div className="min-h-screen">
            {/* Normal header */}
            <ConsultationHeader
                title={title}
                description={description}
                endDate={consultation.endDate}
                isActive={consultation.isActive}
                commentCount={comments.length}
                currentView={currentView}
            />

            {/* Scrollable document content */}
            <ConsultationDocument
                regulationData={regulationData}
                baseUrl={baseUrl}
                className=""
                expandedChapters={expandedChapters}
                expandedArticles={expandedArticles}
                onToggleChapter={toggleChapter}
                onToggleArticle={toggleArticle}
                onReferenceClick={handleReferenceClick}
                comments={comments}
                currentUser={currentUser}
                consultationId={consultationId}
                cityId={cityId}
            />

            {/* Floating action button for view toggle */}
            <ViewToggleButton
                currentView={currentView}
                onToggle={toggleView}
            />
        </div>
    );
} 