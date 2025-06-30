import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageCircle } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import AISummaryCard from "./AISummaryCard";
import MarkdownContent from "./MarkdownContent";
import CommentSection from "./CommentSection";
import { Article, ReferenceFormat, RegulationData } from "./types";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface ArticleViewProps {
    article: Article;
    baseUrl: string;
    isExpanded: boolean;
    onToggle: () => void;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    comments?: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId?: string;
    cityId?: string;
}

export default function ArticleView({
    article,
    baseUrl,
    isExpanded,
    onToggle,
    referenceFormat,
    onReferenceClick,
    regulationData,
    comments,
    currentUser,
    consultationId,
    cityId
}: ArticleViewProps) {
    // Count comments for this article
    const articleCommentCount = comments?.filter(comment =>
        comment.entityType === 'ARTICLE' && comment.entityId === article.id
    ).length || 0;
    return (
        <div id={article.id} className="pl-3 md:pl-6 border-l-2 border-muted">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full py-2 group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity mr-2">
                        <div className="flex-1">
                            <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">
                                ΑΡΘΡΟ {article.num}
                            </div>
                            <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">{article.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 self-center">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MessageCircle className="h-3 w-3" />
                                <span className="font-medium">{articleCommentCount}</span>
                            </div>
                            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center self-center">
                        <PermalinkButton href={`${baseUrl}#${article.id}`} />
                    </div>
                </div>

                {/* AI Summary Card - outside collapsible trigger for full width */}
                {article.summary && (
                    <div className="mt-1 md:mt-2 mb-2">
                        <AISummaryCard summary={article.summary} />
                    </div>
                )}

                <CollapsibleContent className="pt-3 md:pt-4 pb-2">
                    <MarkdownContent
                        content={article.body}
                        referenceFormat={referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                    />

                    {/* Comment Section */}
                    <CommentSection
                        entityType="article"
                        entityId={article.id}
                        entityTitle={article.title}
                        contactEmail={regulationData?.contactEmail}
                        comments={comments}
                        consultationId={consultationId}
                        cityId={cityId}
                    />
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
} 