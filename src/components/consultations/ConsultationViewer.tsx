"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Map, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ConsultationHeader from "./ConsultationHeader";
import ConsultationMap from "./ConsultationMap";
import ConsultationDocument from "./ConsultationDocument";
import ViewToggleButton from "./ViewToggleButton";
import CommentsOverviewSheet from "./CommentsOverviewSheet";
import MarkdownContent from "./MarkdownContent";

import { RegulationData, CurrentUser } from "./types";
import { ConsultationCommentWithUpvotes, ConsultationWithStatus } from "@/lib/db/consultations";

type ViewMode = 'map' | 'document';

interface Consultation {
    id: string;
    name: string;
    jsonUrl: string;
    endDate: Date;
    isActive: boolean;
    isActiveComputed: boolean;
}

interface ConsultationViewerProps {
    consultation: ConsultationWithStatus;
    regulationData: RegulationData | null;
    baseUrl: string; // Base URL for the consultation page (for permalinks)
    comments: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId: string;
    cityId: string;
    cityName?: string;
    cityLogoUrl?: string | null;
}

export default function ConsultationViewer({
    consultation,
    regulationData,
    baseUrl,
    comments,
    currentUser,
    consultationId,
    cityId,
    cityName,
    cityLogoUrl
}: ConsultationViewerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const defaultView = regulationData?.defaultView || 'document';

    // Default to the regulation's defaultView, unless URL specifies otherwise
    const [currentView, setCurrentView] = useState<ViewMode>(defaultView);

    // Track which chapters and articles are expanded
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

    // Track comments overview sheet state
    const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);

    // Track whether the map summary card has been dismissed
    // Don't show by default if URL has a hash (direct link to a community)
    const [showMapSummary, setShowMapSummary] = useState(true);

    // Hide welcome dialog if URL has a hash on mount (direct link)
    useEffect(() => {
        if (window.location.hash) {
            setShowMapSummary(false);
        }
    }, []);

    // Update view based on URL on mount and when search params change
    useEffect(() => {
        const viewParam = searchParams.get('view');
        if (viewParam === 'map' || viewParam === 'document') {
            setCurrentView(viewParam as ViewMode);
        } else {
            // Use the regulation's default view and update URL
            setCurrentView(defaultView);
            if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                if (!params.has('view')) {
                    params.set('view', defaultView);
                    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
                    router.replace(newUrl, { scroll: false });
                }
            }
        }
    }, [searchParams, router, defaultView]);

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
    const findChapterForArticle = useCallback((articleId: string): string | null => {
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
    }, [regulationData]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }, [currentView, regulationData, findChapterForArticle]); // Only run when view changes or regulation data loads

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

    // Handle comment navigation from comments overview sheet
    const handleCommentClick = (comment: ConsultationCommentWithUpvotes) => {
        // Navigate to the entity based on comment type
        if (comment.entityType === 'CHAPTER' || comment.entityType === 'ARTICLE') {
            // Navigate to document section
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'document');
            const newUrl = `${window.location.pathname}?${params.toString()}#${comment.entityId}`;
            router.push(newUrl, { scroll: false });
            window.location.hash = `#${comment.entityId}`; // To trigger hash change event
        } else if (comment.entityType === 'GEOSET' || comment.entityType === 'GEOMETRY') {
            // Navigate to map view
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'map');
            const newUrl = `${window.location.pathname}?${params.toString()}#${comment.entityId}`;
            router.push(newUrl, { scroll: false });
            // Scroll to top so the full-screen map is visible
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
            if (currentView === 'map') {
                // Already in map view - directly set hash to trigger ConsultationMap's hashchange handler
                // (router.push uses History.pushState which does NOT trigger hashchange)
                window.location.hash = referenceId;
            } else {
                // Switch to map view first - ConsultationMap will handle the hash on mount
                const params = new URLSearchParams(window.location.search);
                params.set('view', 'map');
                const newUrl = `${window.location.pathname}?${params.toString()}#${referenceId}`;
                router.push(newUrl, { scroll: false });
            }
            // Scroll to top so the full-screen map is visible
            window.scrollTo(0, 0);
        }
    };

    const title = regulationData?.title || consultation.name;
    const description = "Διαβούλευση για κανονισμό";

    // Render the current view content
    const renderCurrentView = () => {
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
                            onShowInfo={() => setShowMapSummary(true)}
                        />
                    </div>

                    {/* Welcome dialog */}
                    <Dialog open={showMapSummary && !!regulationData?.summary} onOpenChange={setShowMapSummary}>
                        <DialogContent className="max-w-xl">
                            {/* Logos */}
                            <div className="flex items-center justify-center gap-4 pt-1">
                                {cityLogoUrl && (
                                    <div className="relative h-12 w-12 shrink-0">
                                        <Image
                                            src={cityLogoUrl}
                                            alt={cityName ? `Λογότυπο ${cityName}` : 'Λογότυπο Δήμου'}
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                )}
                                <div className="relative h-10 w-10 shrink-0">
                                    <Image
                                        src="/logo.png"
                                        alt="OpenCouncil"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            </div>

                            <DialogHeader className="text-center sm:text-center">
                                <div className="text-lg font-bold tracking-wide">
                                    ΔΙΑΒΟΥΛΕΥΣΗ
                                </div>
                                <DialogTitle className="text-sm font-normal text-muted-foreground leading-tight">
                                    {regulationData?.title}
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    Περίληψη διαβούλευσης
                                </DialogDescription>
                            </DialogHeader>
                            {regulationData?.summary && (
                                <div className="max-h-52 overflow-y-auto -mx-1 px-1">
                                    <MarkdownContent
                                        content={regulationData.summary}
                                        variant="muted"
                                        className="text-sm"
                                        referenceFormat={regulationData.referenceFormat}
                                        onReferenceClick={(id) => {
                                            setShowMapSummary(false);
                                            handleReferenceClick(id);
                                        }}
                                        regulationData={regulationData}
                                    />
                                </div>
                            )}
                            <div className="flex flex-col gap-2 pt-1">
                                <Button
                                    onClick={() => setShowMapSummary(false)}
                                    className="w-full"
                                >
                                    <MapPin className="h-4 w-4 mr-2" />
                                    Βρείτε την περιοχή σας
                                </Button>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => {
                                            setShowMapSummary(false);
                                            toggleView();
                                        }}
                                        variant="outline"
                                        className="flex-1"
                                    >
                                        <FileText className="h-4 w-4 mr-1.5" />
                                        Κείμενο
                                    </Button>
                                    {comments.length > 0 && (
                                        <Button
                                            onClick={() => {
                                                setShowMapSummary(false);
                                                setCommentsSheetOpen(true);
                                            }}
                                            variant="outline"
                                            className="flex-1 text-muted-foreground"
                                        >
                                            <MessageSquare className="h-4 w-4 mr-1.5" />
                                            {comments.length} σχόλια
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground text-center pt-1 border-t">
                                Σχολιάστε και εκφράστε τη γνώμη σας -- τα σχόλια αποστέλλονται απευθείας στον Δήμο ως επίσημες παρατηρήσεις.
                            </p>
                        </DialogContent>
                    </Dialog>

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
                    cityTimezone={consultation.city.timezone}
                    isActive={consultation.isActive}
                    isActiveComputed={consultation.isActiveComputed}
                    commentCount={comments.length}
                    currentView={currentView}
                    onCommentsClick={() => setCommentsSheetOpen(true)}
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
                    consultationIsActive={consultation.isActiveComputed}
                />

                {/* Floating action button for view toggle */}
                <ViewToggleButton
                    currentView={currentView}
                    onToggle={toggleView}
                />
            </div>
        );
    };

    return (
        <>
            {renderCurrentView()}

            {/* Comments overview sheet - always available regardless of view */}
            <CommentsOverviewSheet
                isOpen={commentsSheetOpen}
                onClose={() => setCommentsSheetOpen(false)}
                comments={comments}
                totalCount={comments.length}
                regulationData={regulationData || undefined}
                onCommentClick={handleCommentClick}
            />
        </>
    );
} 