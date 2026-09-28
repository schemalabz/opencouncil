import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageCircle } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import { ViewLink } from "./views/ui";
import MarkdownContent from "./MarkdownContent";
import { Article, ReferenceFormat, RegulationData } from "./types";

interface ArticleViewProps {
    article: Article;
    isExpanded: boolean;
    onToggle: () => void;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    commentCount: number;
    commentHref: string;
    active: boolean;
}

export default function ArticleView({
    article,
    isExpanded,
    onToggle,
    referenceFormat,
    onReferenceClick,
    regulationData,
    commentCount,
    commentHref,
    active
}: ArticleViewProps) {
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
                            {commentCount > 0 && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MessageCircle className="h-3 w-3" aria-hidden="true" />
                                    <span className="font-medium">{commentCount}</span>
                                </div>
                            )}
                            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center self-center">
                        <PermalinkButton entityId={article.id} view="document" />
                    </div>
                </div>

                <CollapsibleContent className="pt-3 md:pt-4 pb-2">
                    <MarkdownContent
                        content={article.body}
                        referenceFormat={referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                    />
                    <ViewLink href={commentHref} className="mt-4 inline-flex items-center gap-2 rounded-lg border-[1.5px] border-[#c2410c] px-3 py-2 text-sm font-semibold text-[#9a3412] hover:bg-[#fff7ed]">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        {active ? 'Σχολιάστε αυτό το άρθρο' : 'Τα σχόλια'}{commentCount > 0 ? ` (${commentCount})` : ''}
                    </ViewLink>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
