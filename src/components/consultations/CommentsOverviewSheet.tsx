"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import sanitizeHtml from 'sanitize-html';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Heart, MessageSquare, ChevronDown, Clock, TrendingUp, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";
import { RegulationData } from "./types";

type SortOption = 'recent' | 'liked';

interface CommentsOverviewSheetProps {
    isOpen: boolean;
    onClose: () => void;
    comments: ConsultationCommentWithUpvotes[];
    onCommentClick: (comment: ConsultationCommentWithUpvotes) => void;
    totalCount: number;
    regulationData?: RegulationData;
}

export default function CommentsOverviewSheet({
    isOpen,
    onClose,
    comments,
    onCommentClick,
    totalCount,
    regulationData
}: CommentsOverviewSheetProps) {
    const isMobile = useIsMobile();
    const { data: session } = useSession();
    const [sortBy, setSortBy] = useState<SortOption>('recent');
    const [upvoting, setUpvoting] = useState<string | null>(null);
    const [localComments, setLocalComments] = useState(comments);
    const [expandedComments, setExpandedComments] = useState(new Set<string>());

    // Sanitize HTML content to prevent XSS attacks
    const getSafeHtmlContent = (html: string): string => {
        return sanitizeHtml(html, {
            allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li'],
            allowedAttributes: {
                'a': ['href', 'target', 'rel']
            },
            allowedSchemes: ['http', 'https', 'mailto'],
            transformTags: {
                // Ensure external links open in new tab with security attributes
                'a': (tagName, attribs) => ({
                    tagName: 'a',
                    attribs: {
                        ...attribs,
                        target: '_blank',
                        rel: 'noopener noreferrer'
                    }
                })
            }
        });
    };

    // Update local comments when props change
    useEffect(() => {
        setLocalComments(comments);
    }, [comments]);

    const getEntityTypeLabel = (entityType: string) => {
        switch (entityType) {
            case 'CHAPTER':
                return 'Κεφάλαιο';
            case 'ARTICLE':
                return 'Άρθρο';
            case 'GEOSET':
                return 'Σύνολο Περιοχών';
            case 'GEOMETRY':
                return 'Περιοχή';
            default:
                return 'Στοιχείο';
        }
    };

    const getEntityTitle = (comment: ConsultationCommentWithUpvotes): string => {
        if (!regulationData?.regulation) {
            return 'Άγνωστο στοιχείο';
        }

        switch (comment.entityType) {
            case 'CHAPTER': {
                const chapter = regulationData.regulation
                    .filter(item => item.type === 'chapter')
                    .find(chapter => chapter.id === comment.entityId);
                return chapter?.title || 'Άγνωστο κεφάλαιο';
            }
            case 'ARTICLE': {
                for (const chapter of regulationData.regulation.filter(item => item.type === 'chapter')) {
                    const article = chapter.articles?.find(article => article.id === comment.entityId);
                    if (article) {
                        return article.title || 'Άγνωστο άρθρο';
                    }
                }
                return 'Άγνωστο άρθρο';
            }
            case 'GEOSET': {
                const geoset = regulationData.regulation
                    .filter(item => item.type === 'geoset')
                    .find(geoset => geoset.id === comment.entityId);
                return geoset?.name || 'Άγνωστο σύνολο περιοχών';
            }
            case 'GEOMETRY': {
                for (const geoset of regulationData.regulation.filter(item => item.type === 'geoset')) {
                    const geometry = geoset.geometries?.find(geometry => geometry.id === comment.entityId);
                    if (geometry) {
                        return geometry.name || 'Άγνωστη περιοχή';
                    }
                }
                return 'Άγνωστη περιοχή';
            }
            default:
                return 'Άγνωστο στοιχείο';
        }
    };

    const sortedComments = [...localComments].sort((a, b) => {
        if (sortBy === 'recent') {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else {
            return (b.upvoteCount || 0) - (a.upvoteCount || 0);
        }
    });

    const handleCommentClick = (comment: ConsultationCommentWithUpvotes) => {
        onCommentClick(comment);
        onClose();
    };

    const handleUpvote = async (e: React.MouseEvent, commentId: string) => {
        e.stopPropagation(); // Prevent triggering comment click

        if (!session || upvoting) return;

        setUpvoting(commentId);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/upvote`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to toggle upvote');
            }

            const { upvoted, upvoteCount } = await response.json();

            // Update the local comment state
            setLocalComments(prev => prev.map(comment => {
                if (comment.id === commentId) {
                    return { ...comment, upvoteCount, hasUserUpvoted: upvoted };
                }
                return comment;
            }));
        } catch (error) {
            console.error('Error toggling upvote:', error);
            alert("Υπήρξε σφάλμα. Παρακαλώ δοκιμάστε ξανά.");
        } finally {
            setUpvoting(null);
        }
    };

    const handleReferenceClick = (e: React.MouseEvent, comment: ConsultationCommentWithUpvotes) => {
        e.stopPropagation(); // Prevent any parent click handlers
        handleCommentClick(comment);
    };

    const toggleCommentExpansion = (commentId: string) => {
        setExpandedComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(commentId)) {
                newSet.delete(commentId);
            } else {
                newSet.add(commentId);
            }
            return newSet;
        });
    };

    const isCommentTruncated = (content: string): boolean => {
        // Strip HTML tags to get plain text
        const textContent = content.replace(/<[^>]*>/g, '');

        // Check if content is longer than ~300 characters
        if (textContent.length > 300) {
            return true;
        }

        // Check for multiple paragraphs (more than one <p> tag)
        const paragraphCount = (content.match(/<p>/g) || []).length;
        if (paragraphCount > 1) {
            return true;
        }

        // Check for multiple line breaks
        const lineBreakCount = (content.match(/<br\s*\/?>/gi) || []).length;
        if (lineBreakCount > 2) {
            return true;
        }

        return false;
    };

    const renderContent = () => (
        <>
            {/* Header */}
            <div className={cn("pr-6 flex-shrink-0", isMobile && "px-4")}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs text-muted-foreground font-medium mb-1">
                            ΣΧΟΛΙΑ
                        </div>
                        <div className="text-left text-lg font-semibold">
                            {totalCount} σχόλια συνολικά
                        </div>
                    </div>
                </div>
            </div>

            {/* Sort Controls */}
            <div className={cn("flex gap-2 mb-4 flex-shrink-0", isMobile && "px-4")}>
                <Button
                    variant={sortBy === 'recent' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSortBy('recent')}
                    className="flex items-center gap-1"
                >
                    <Clock className="h-3 w-3" />
                    Πρόσφατα
                </Button>
                <Button
                    variant={sortBy === 'liked' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSortBy('liked')}
                    className="flex items-center gap-1"
                >
                    <TrendingUp className="h-3 w-3" />
                    Δημοφιλή
                </Button>
            </div>

            {/* Comments List */}
            <div className={cn("flex-1 overflow-y-auto overscroll-contain space-y-6", isMobile && "px-4")}>
                {sortedComments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Δεν υπάρχουν σχόλια ακόμα</p>
                    </div>
                ) : (
                    sortedComments.map((comment, index) => (
                        <div key={comment.id} className="space-y-3">
                            {/* Reference Box */}
                            <div
                                onClick={(e) => handleReferenceClick(e, comment)}
                                className="bg-muted/30 border border-muted/50 rounded-md p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {getEntityTypeLabel(comment.entityType)}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {getEntityTitle(comment)}
                                    </span>
                                </div>
                            </div>

                            {/* Comment */}
                            <div className="flex items-start gap-3 p-3 bg-background border border-border rounded-lg">
                                {/* Upvote Section */}
                                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-6 w-6 p-0",
                                            comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                        )}
                                        onClick={(e) => handleUpvote(e, comment.id)}
                                        disabled={!session || upvoting === comment.id}
                                    >
                                        {upvoting === comment.id ? (
                                            <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                                        ) : (
                                            <ChevronUp className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <span className={cn(
                                        "text-xs font-medium",
                                        comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                    )}>
                                        {comment.upvoteCount || 0}
                                    </span>
                                </div>

                                {/* Comment Content */}
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div
                                        className="cursor-pointer hover:bg-muted/20 transition-colors rounded p-2 -m-2"
                                        onClick={() => handleCommentClick(comment)}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="font-medium text-sm">
                                                {comment.user?.name || 'Ανώνυμος'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(comment.createdAt), {
                                                    addSuffix: true,
                                                    locale: el
                                                })}
                                            </span>
                                        </div>
                                        <div
                                            className={cn(
                                                "prose prose-sm max-w-none text-sm",
                                                !expandedComments.has(comment.id) && isCommentTruncated(comment.body) && "line-clamp-4"
                                            )}
                                            dangerouslySetInnerHTML={{ __html: getSafeHtmlContent(comment.body) }}
                                        />
                                    </div>

                                    {/* Show More/Less Button */}
                                    {isCommentTruncated(comment.body) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCommentExpansion(comment.id);
                                            }}
                                            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <div className="flex items-center gap-1">
                                                {expandedComments.has(comment.id) ? (
                                                    <>
                                                        <ChevronUp className="h-3 w-3" />
                                                        <span>Εμφάνιση λιγότερων</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="h-3 w-3" />
                                                        <span>Εμφάνιση περισσότερων</span>
                                                    </>
                                                )}
                                            </div>
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Separator between comments */}
                            {index < sortedComments.length - 1 && (
                                <Separator className="my-2" />
                            )}
                        </div>
                    ))
                )}
            </div>
        </>
    );

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DrawerContent className="max-h-[85vh] flex flex-col">
                    <DrawerTitle className="sr-only">{totalCount} σχόλια συνολικά</DrawerTitle>
                    <DrawerDescription className="sr-only">Επισκόπηση σχολίων</DrawerDescription>
                    {renderContent()}
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="right"
                className="w-96 max-w-[calc(100vw-2rem)] sm:max-w-md flex flex-col"
                overlayClassName="bg-black/20"
            >
                <SheetHeader className="pr-6 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-xs text-muted-foreground font-medium mb-1">
                                ΣΧΟΛΙΑ
                            </div>
                            <SheetTitle className="text-left text-lg">
                                {totalCount} σχόλια συνολικά
                            </SheetTitle>
                        </div>
                    </div>
                </SheetHeader>

                {/* Sort Controls */}
                <div className="flex gap-2 mb-4 flex-shrink-0">
                    <Button
                        variant={sortBy === 'recent' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSortBy('recent')}
                        className="flex items-center gap-1"
                    >
                        <Clock className="h-3 w-3" />
                        Πρόσφατα
                    </Button>
                    <Button
                        variant={sortBy === 'liked' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSortBy('liked')}
                        className="flex items-center gap-1"
                    >
                        <TrendingUp className="h-3 w-3" />
                        Δημοφιλή
                    </Button>
                </div>

                {/* Comments List */}
                <div className="flex-1 overflow-y-auto overscroll-contain space-y-6">
                    {sortedComments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Δεν υπάρχουν σχόλια ακόμα</p>
                        </div>
                    ) : (
                        sortedComments.map((comment, index) => (
                            <div key={comment.id} className="space-y-3">
                                {/* Reference Box */}
                                <div
                                    onClick={(e) => handleReferenceClick(e, comment)}
                                    className="bg-muted/30 border border-muted/50 rounded-md p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                            {getEntityTypeLabel(comment.entityType)}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            {getEntityTitle(comment)}
                                        </span>
                                    </div>
                                </div>

                                {/* Comment */}
                                <div className="flex items-start gap-3 p-3 bg-background border border-border rounded-lg">
                                    {/* Upvote Section */}
                                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-6 w-6 p-0",
                                                comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                            )}
                                            onClick={(e) => handleUpvote(e, comment.id)}
                                            disabled={!session || upvoting === comment.id}
                                        >
                                            {upvoting === comment.id ? (
                                                <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                                            ) : (
                                                <ChevronUp className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <span className={cn(
                                            "text-xs font-medium",
                                            comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                        )}>
                                            {comment.upvoteCount || 0}
                                        </span>
                                    </div>

                                    {/* Comment Content */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div
                                            className="cursor-pointer hover:bg-muted/20 transition-colors rounded p-2 -m-2"
                                            onClick={() => handleCommentClick(comment)}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-medium text-sm">
                                                    {comment.user?.name || 'Ανώνυμος'}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDistanceToNow(new Date(comment.createdAt), {
                                                        addSuffix: true,
                                                        locale: el
                                                    })}
                                                </span>
                                            </div>
                                            <div
                                                className={cn(
                                                    "prose prose-sm max-w-none text-sm",
                                                    !expandedComments.has(comment.id) && isCommentTruncated(comment.body) && "line-clamp-4"
                                                )}
                                                dangerouslySetInnerHTML={{ __html: getSafeHtmlContent(comment.body) }}
                                            />
                                        </div>

                                        {/* Show More/Less Button */}
                                        {isCommentTruncated(comment.body) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleCommentExpansion(comment.id);
                                                }}
                                                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <div className="flex items-center gap-1">
                                                    {expandedComments.has(comment.id) ? (
                                                        <>
                                                            <ChevronUp className="h-3 w-3" />
                                                            <span>Εμφάνιση λιγότερων</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown className="h-3 w-3" />
                                                            <span>Εμφάνιση περισσότερων</span>
                                                        </>
                                                    )}
                                                </div>
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Separator between comments */}
                                {index < sortedComments.length - 1 && (
                                    <Separator className="my-2" />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
} 