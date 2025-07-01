import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageCircle } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import AISummaryCard from "./AISummaryCard";
import MarkdownContent from "./MarkdownContent";
import CommentSection from "./CommentSection";
import { RegulationItem, ReferenceFormat, RegulationData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface ChapterViewProps {
    chapter: RegulationItem;
    baseUrl: string;
    children?: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    expandedArticles: Set<string>;
    onToggleArticle: (articleId: string) => void;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    comments?: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId?: string;
    cityId?: string;
    onCommentUpvote?: (commentId: string, upvoted: boolean, upvoteCount: number) => void;
}

export default function ChapterView({
    chapter,
    baseUrl,
    children,
    isExpanded,
    onToggle,
    expandedArticles,
    onToggleArticle,
    referenceFormat,
    onReferenceClick,
    regulationData,
    comments,
    currentUser,
    consultationId,
    cityId,
    onCommentUpvote
}: ChapterViewProps) {
    if (!chapter.articles) return null;

    const articleCount = chapter.articles.length;

    // Count comments for this chapter and all its articles
    const chapterCommentCount = comments?.filter(comment =>
        comment.entityType === 'CHAPTER' && comment.entityId === chapter.id
    ).length || 0;

    const articlesCommentCount = comments?.filter(comment =>
        comment.entityType === 'ARTICLE' &&
        chapter.articles?.some(article => article.id === comment.entityId)
    ).length || 0;

    const getCommentDisplay = () => {
        if (chapterCommentCount === 0 && articlesCommentCount === 0) {
            return '0';
        }

        if (chapterCommentCount > 0 && articlesCommentCount === 0) {
            return `${chapterCommentCount} σχόλια`;
        }

        if (chapterCommentCount === 0 && articlesCommentCount > 0) {
            return `${articlesCommentCount} στα περιεχόμενα άρθρα`;
        }

        // Both have comments
        return `${chapterCommentCount} σχόλια στο κεφάλαιο και ${articlesCommentCount} στα περιεχόμενα άρθρα`;
    };

    return (
        <div id={chapter.id} className="border-b border-border pb-6 md:pb-8 mb-6 md:mb-8 last:border-b-0 last:pb-0 last:mb-0">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity">
                        <div className="flex-1">
                            <div className="text-xs md:text-sm text-muted-foreground font-medium mb-1 uppercase tracking-wider">
                                ΚΕΦΑΛΑΙΟ {chapter.num}
                            </div>
                            <h2 className="text-lg md:text-2xl font-bold mb-2 md:mb-3 leading-tight text-left">
                                {chapter.title || chapter.name}
                            </h2>

                            {/* Comments below title */}
                            <div className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground mb-2">
                                <MessageCircle className="h-3 w-3 md:h-4 md:w-4" />
                                <span className="font-medium">{getCommentDisplay()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 md:gap-3 self-center shrink-0">
                            <span className="text-xs md:text-sm text-muted-foreground font-medium">
                                {articleCount} {articleCount === 1 ? 'άρθρο' : 'άρθρα'}
                            </span>
                            <ChevronDown className={`h-4 w-4 md:h-5 md:w-5 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center self-center">
                        <PermalinkButton href={`${baseUrl}#${chapter.id}`} />
                    </div>
                </div>

                {/* AI Summary Card - outside collapsible trigger for full width */}
                {chapter.summary && (
                    <div className="mt-2 md:mt-3 mb-2 md:mb-3">
                        <AISummaryCard summary={chapter.summary} />
                    </div>
                )}

                <CollapsibleContent>
                    <div className="pt-4 md:pt-6">
                        {chapter.preludeBody && (
                            <div className="mb-6 md:mb-8">
                                <MarkdownContent
                                    content={chapter.preludeBody}
                                    variant="muted"
                                    referenceFormat={referenceFormat}
                                    onReferenceClick={onReferenceClick}
                                    regulationData={regulationData}
                                />
                            </div>
                        )}

                        <div className="space-y-4 md:space-y-6">
                            {children}
                        </div>

                        {/* Comment Section */}
                        <CommentSection
                            entityType="chapter"
                            entityId={chapter.id}
                            entityTitle={chapter.title || chapter.name || ''}
                            contactEmail={regulationData?.contactEmail}
                            comments={comments}
                            consultationId={consultationId}
                            cityId={cityId}
                            onCommentUpvote={onCommentUpvote}
                        />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
} 