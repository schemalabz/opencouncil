"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Heart, MessageSquare, ChevronDown, Clock, TrendingUp, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
    const [sortBy, setSortBy] = useState<SortOption>('recent');

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

    const sortedComments = [...comments].sort((a, b) => {
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
                                    onClick={() => handleCommentClick(comment)}
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
                                <div
                                    onClick={() => handleCommentClick(comment)}
                                    className="flex items-start gap-3 p-3 bg-background border border-border rounded-lg cursor-pointer hover:bg-muted/20 transition-colors"
                                >
                                    {/* Upvote Section */}
                                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                        <div className={cn(
                                            "h-6 w-6 flex items-center justify-center",
                                            comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                        )}>
                                            <ChevronUp className="h-4 w-4" />
                                        </div>
                                        <span className={cn(
                                            "text-xs font-medium",
                                            comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                        )}>
                                            {comment.upvoteCount || 0}
                                        </span>
                                    </div>

                                    {/* Comment Content */}
                                    <div className="flex-1 min-w-0">
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
                                            className="prose prose-sm max-w-none text-sm line-clamp-4"
                                            dangerouslySetInnerHTML={{ __html: comment.body }}
                                        />
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