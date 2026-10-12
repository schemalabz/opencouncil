import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardClass, headingClass, textLinkClass, ViewLink } from "./views/ui";
import MarkdownContent from "./MarkdownContent";
import { RegulationItem, ReferenceFormat, RegulationData } from "./types";

interface ChapterViewProps {
    chapter: RegulationItem;
    children?: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
    /** Comments on the chapter itself and on its articles. */
    commentCount: number;
    commentHref: string;
    active: boolean;
}

/** A chapter as a card: its number and title open the list of its articles. */
export default function ChapterView({
    chapter,
    children,
    isExpanded,
    onToggle,
    referenceFormat,
    onReferenceClick,
    regulationData,
    commentCount,
    commentHref,
    active
}: ChapterViewProps) {
    if (!chapter.articles) return null;

    const articleCount = chapter.articles.length;

    return (
        <section id={chapter.id} className={cn(cardClass, "scroll-mt-16 overflow-hidden sm:scroll-mt-24")}>
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <h2 className={cn(headingClass, "!m-0")}>
                    <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-stone-50">
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-normal text-stone-600">Κεφάλαιο {chapter.num}</span>
                            <span className="block text-[17px] font-bold leading-snug lg:text-xl">{chapter.title || chapter.name}</span>
                            {commentCount > 0 && (
                                <span className="block pt-0.5 text-[13px] font-normal text-stone-600">{commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}</span>
                            )}
                        </span>
                        <span className="shrink-0 text-[13px] font-normal text-stone-600">{articleCount} {articleCount === 1 ? 'άρθρο' : 'άρθρα'}</span>
                        <ChevronDown className={cn("h-[18px] w-[18px] shrink-0 text-stone-500 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                    </CollapsibleTrigger>
                </h2>

                <CollapsibleContent>
                    {chapter.preludeBody && (
                        <div className="border-t border-stone-100 px-5 py-4">
                            <MarkdownContent
                                content={chapter.preludeBody}
                                className="text-[17px] text-stone-700"
                                referenceFormat={referenceFormat}
                                onReferenceClick={onReferenceClick}
                                regulationData={regulationData}
                            />
                        </div>
                    )}

                    {children}

                    {active && (
                        <div className="border-t border-stone-100 px-5 py-3.5">
                            <ViewLink href={commentHref} className={cn(textLinkClass, "text-[15px]")}>Σχολιάστε όλο το κεφάλαιο</ViewLink>
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
