import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import AISummaryCard from "./AISummaryCard";
import MarkdownContent from "./MarkdownContent";
import { Article } from "./types";

interface ArticleViewProps {
    article: Article;
    baseUrl: string;
    isExpanded: boolean;
    onToggle: () => void;
}

export default function ArticleView({ article, baseUrl, isExpanded, onToggle }: ArticleViewProps) {
    return (
        <div id={article.id} className="pl-3 md:pl-6 border-l-2 border-muted">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full py-2 group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity mr-2">
                        <div className="flex-1">
                            <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">Άρθρο {article.num}: {article.title}</h3>
                            {article.summary && (
                                <div className="mt-1 md:mt-2">
                                    <AISummaryCard summary={article.summary} />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center mt-1">
                            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center mt-1">
                        <PermalinkButton href={`${baseUrl}#${article.id}`} />
                    </div>
                </div>
                <CollapsibleContent className="pt-3 md:pt-4 pb-2">
                    <MarkdownContent content={article.body} />
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
} 