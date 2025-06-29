import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import AISummaryCard from "./AISummaryCard";
import MarkdownContent from "./MarkdownContent";
import { RegulationItem } from "./types";

interface ChapterViewProps {
    chapter: RegulationItem;
    baseUrl: string;
    children?: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    expandedArticles: Set<string>;
    onToggleArticle: (articleId: string) => void;
}

export default function ChapterView({
    chapter,
    baseUrl,
    children,
    isExpanded,
    onToggle,
    expandedArticles,
    onToggleArticle
}: ChapterViewProps) {
    if (!chapter.articles) return null;

    const articleCount = chapter.articles.length;

    return (
        <div id={chapter.id} className="border-b border-border pb-8 mb-8 last:border-b-0 last:pb-0 last:mb-0">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity mr-2">
                        <div className="flex-1 pl-8">
                            <h2 className="text-xl md:text-2xl font-bold mb-3 leading-tight text-left">
                                {chapter.title || chapter.name}
                            </h2>
                            {chapter.summary && (
                                <div className="mb-3">
                                    <AISummaryCard summary={chapter.summary} />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 shrink-0">
                            <span className="text-xs md:text-sm text-muted-foreground font-medium">
                                {articleCount} {articleCount === 1 ? 'άρθρο' : 'άρθρα'}
                            </span>
                            <ChevronDown className="h-4 w-4 md:h-5 md:w-5 shrink-0 transition-transform data-[state=open]:rotate-180 text-muted-foreground" />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center mt-1">
                        <PermalinkButton href={`${baseUrl}#${chapter.id}`} />
                    </div>
                </div>

                <CollapsibleContent>
                    <div className="pl-8 pt-6">
                        {chapter.preludeBody && (
                            <div className="mb-8">
                                <MarkdownContent content={chapter.preludeBody} variant="muted" />
                            </div>
                        )}

                        <div className="space-y-6">
                            {children}
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
} 