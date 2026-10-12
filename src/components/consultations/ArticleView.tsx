import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { smallActionClass, ViewLink } from "./views/ui";
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

/** An article inside its chapter's card: its number and title open the text and its comment button. */
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
        <div id={article.id} className="scroll-mt-16 border-t border-stone-100 sm:scroll-mt-24">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <h3 className="m-0">
                    <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-stone-50">
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-normal text-stone-600">Άρθρο {article.num}</span>
                            <span className="block text-[17px] font-semibold leading-snug">{article.title}</span>
                        </span>
                        {commentCount > 0 && (
                            <span className="shrink-0 text-[13px] font-normal text-stone-600">{commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}</span>
                        )}
                        <ChevronDown className={cn("h-[18px] w-[18px] shrink-0 text-stone-500 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                    </CollapsibleTrigger>
                </h3>

                <CollapsibleContent className="px-5 pb-4">
                    <MarkdownContent
                        content={article.body}
                        className="text-[17px] text-stone-700"
                        referenceFormat={referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                    />
                    <ViewLink href={commentHref} className={cn(smallActionClass, "mt-3 inline-flex")}>
                        {active ? 'Σχολιάστε αυτό το άρθρο' : 'Τα σχόλια'}{commentCount > 0 ? ` (${commentCount})` : ''}
                    </ViewLink>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
