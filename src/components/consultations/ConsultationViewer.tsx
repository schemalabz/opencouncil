"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/routing";
import { MapPin, Map, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Credenza, CredenzaContent, CredenzaHeader, CredenzaTitle, CredenzaDescription, CredenzaBody } from "@/components/ui/credenza";
import ConsultationHeader from "./ConsultationHeader";
import ConsultationMap from "./ConsultationMap";
import ConsultationDocument from "./ConsultationDocument";
import ViewToggleButton from "./ViewToggleButton";
import CommentsOverviewSheet from "./CommentsOverviewSheet";
import MarkdownContent from "./MarkdownContent";

import { RegulationData, CurrentUser } from "./types";
import { ConsultationCommentWithUpvotes, ConsultationWithStatus } from "@/lib/db/consultations";
import {
    buildConsultationUrl,
    ConsultationEntityType,
    ConsultationUrlState,
    ConsultationView,
    getConsultationViewForEntityType,
    isConsultationEntityCompatibleWithView,
    resolveConsultationEntityType,
    resolveConsultationUrlState,
} from "./consultationUrl";

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
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const defaultView: ConsultationView = regulationData?.defaultView || "document";

    const getLivePathname = useCallback(() => {
        if (typeof window !== "undefined" && window.location.pathname) {
            return window.location.pathname;
        }

        return pathname;
    }, [pathname]);

    const getResolvedUrlState = useCallback((): ConsultationUrlState => {
        return resolveConsultationUrlState({
            pathname: getLivePathname(),
            defaultView,
            regulationData,
            searchParams,
            liveSearch: typeof window !== "undefined" ? window.location.search : undefined,
            liveHash: typeof window !== "undefined" ? window.location.hash : undefined,
        });
    }, [defaultView, getLivePathname, regulationData, searchParams]);

    const [currentView, setCurrentView] = useState<ConsultationView>(() => getResolvedUrlState().view);
    const [currentEntityId, setCurrentEntityId] = useState<string | null>(() => getResolvedUrlState().entityId);

    // Track which chapters and articles are expanded
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

    // Track comments overview sheet state
    const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);

    // Track whether the map summary card has been dismissed.
    const [showMapSummary, setShowMapSummary] = useState(() => !getResolvedUrlState().entityId);

    // Track whether any drawer is open in the map view (for ViewToggleButton positioning on mobile)
    const [mapDrawerOpen, setMapDrawerOpen] = useState(false);

    // Keep local state aligned with the committed URL and normalize old hash links.
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const resolvedUrlState = getResolvedUrlState();

        setCurrentView(resolvedUrlState.view);
        setCurrentEntityId(resolvedUrlState.entityId);

        if (resolvedUrlState.entityId) {
            setShowMapSummary(false);
        }

        if (resolvedUrlState.needsCanonicalUrl) {
            const currentUrl = `${window.location.pathname}${window.location.search}`;
            if (currentUrl !== resolvedUrlState.canonicalUrl) {
                router.replace(resolvedUrlState.canonicalUrl, { scroll: false });
            }
        }
    }, [getResolvedUrlState, router]);

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

    const scrollToDocumentEntity = useCallback((entityId: string) => {
        let attempts = 0;
        let frameId = 0;

        const tryScroll = () => {
            const element = document.getElementById(entityId);
            if (element) {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
                return;
            }

            if (attempts < 60) {
                attempts += 1;
                frameId = window.requestAnimationFrame(tryScroll);
            }
        };

        frameId = window.requestAnimationFrame(tryScroll);

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, []);

    useEffect(() => {
        if (currentView !== "document" || !currentEntityId) {
            return;
        }

        const entityType = resolveConsultationEntityType(regulationData, currentEntityId);

        if (entityType === "chapter") {
            expandChapter(currentEntityId);
            return scrollToDocumentEntity(currentEntityId);
        }

        if (entityType === "article") {
            const parentChapterId = findChapterForArticle(currentEntityId);
            if (parentChapterId) {
                expandChapter(parentChapterId);
            }
            expandArticle(currentEntityId);
            return scrollToDocumentEntity(currentEntityId);
        }
    }, [currentEntityId, currentView, findChapterForArticle, regulationData, scrollToDocumentEntity]);

    const navigateToConsultationState = useCallback((
        view: ConsultationView,
        entityId: string | null,
        {
            replace = false,
            scrollToTop = false,
        }: { replace?: boolean; scrollToTop?: boolean } = {},
    ) => {
        const entityType = resolveConsultationEntityType(regulationData, entityId);
        const nextEntityId = isConsultationEntityCompatibleWithView(entityType, view) ? entityId : null;
        const nextUrl = buildConsultationUrl(getLivePathname(), {
            view,
            entityId: nextEntityId,
        });

        setCurrentView(view);
        setCurrentEntityId(nextEntityId);

        if (nextEntityId) {
            setShowMapSummary(false);
        }

        const navigate = replace ? router.replace : router.push;
        navigate(nextUrl, { scroll: false });

        if (scrollToTop && typeof window !== "undefined") {
            window.scrollTo(0, 0);
        }
    }, [getLivePathname, regulationData, router]);

    const toggleView = () => {
        const newView: ConsultationView = currentView === "map" ? "document" : "map";
        const currentEntityType = resolveConsultationEntityType(regulationData, currentEntityId);
        const nextEntityId = isConsultationEntityCompatibleWithView(currentEntityType, newView)
            ? currentEntityId
            : null;

        navigateToConsultationState(newView, nextEntityId, {
            scrollToTop: newView === "map",
        });
    };

    // Handle comment navigation from comments overview sheet
    const handleCommentClick = (comment: ConsultationCommentWithUpvotes) => {
        const targetView = comment.entityType === "CHAPTER" || comment.entityType === "ARTICLE"
            ? "document"
            : "map";

        navigateToConsultationState(targetView, comment.entityId, {
            scrollToTop: targetView === "map",
        });
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
        if (referenceType === "chapter" || referenceType === "article") {
            navigateToConsultationState("document", referenceId);
        } else if (referenceType === "geoset" || referenceType === "geometry") {
            navigateToConsultationState("map", referenceId, {
                scrollToTop: true,
            });
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
                            onDrawerStateChange={setMapDrawerOpen}
                        />
                    </div>

                    {/* Welcome dialog */}
                    <Credenza open={showMapSummary && !!regulationData?.summary} onOpenChange={setShowMapSummary}>
                        <CredenzaContent className="max-w-xl">
                            {/* Logos */}
                            <CredenzaBody>
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

                                <CredenzaHeader className="text-center sm:text-center">
                                    <div className="text-lg font-bold tracking-wide">
                                        ΔΙΑΒΟΥΛΕΥΣΗ
                                    </div>
                                    <CredenzaTitle className="text-sm font-normal text-muted-foreground leading-tight">
                                        {regulationData?.title}
                                    </CredenzaTitle>
                                    <CredenzaDescription className="sr-only">
                                        Περίληψη διαβούλευσης
                                    </CredenzaDescription>
                                </CredenzaHeader>
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
                            </CredenzaBody>
                        </CredenzaContent>
                    </Credenza>

                    {/* Floating action button for view toggle */}
                    <ViewToggleButton
                        currentView={currentView}
                        onToggle={toggleView}
                        drawerOpen={mapDrawerOpen}
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