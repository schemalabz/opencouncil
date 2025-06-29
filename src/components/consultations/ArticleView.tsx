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
        <div id={article.id} className="pl-6 border-l-2 border-muted">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full py-2 group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity mr-2">
                        <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2">Άρθρο {article.num}: {article.title}</h3>
                            {article.summary && (
                                <div className="mt-2">
                                    <AISummaryCard summary={article.summary} />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center mt-1">
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform data-[state=open]:rotate-180 text-muted-foreground" />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center mt-1">
                        <PermalinkButton href={`${baseUrl}#${article.id}`} />
                    </div>
                </div>
                <CollapsibleContent className="pt-4 pb-2">
                    <MarkdownContent content={article.body} />
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
} 