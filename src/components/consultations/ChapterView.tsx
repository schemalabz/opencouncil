import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageCircle } from "lucide-react";
import PermalinkButton from "./PermalinkButton";
import { cn } from "@/lib/utils";
import { headingClass, ViewLink } from "./views/ui";
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
        <div id={chapter.id} className="border-b border-border pb-6 md:pb-8 mb-6 md:mb-8 last:border-b-0 last:pb-0 last:mb-0">
            <Collapsible open={isExpanded} onOpenChange={onToggle}>
                <div className="flex items-start justify-between w-full group">
                    <CollapsibleTrigger className="flex items-start justify-between w-full text-left hover:opacity-80 transition-opacity">
                        <div className="flex-1">
                            <div className="text-xs md:text-sm text-muted-foreground font-medium mb-1 uppercase tracking-wider">
                                ΚΕΦΑΛΑΙΟ {chapter.num}
                            </div>
                            <h2 className={cn(headingClass, "mb-2 !text-lg md:mb-3 md:!text-2xl")}>
                                {chapter.title || chapter.name}
                            </h2>
                            {commentCount > 0 && (
                                <div className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground mb-2">
                                    <MessageCircle className="h-3 w-3 md:h-4 md:w-4" aria-hidden="true" />
                                    <span className="font-medium">{commentCount} {commentCount === 1 ? 'σχόλιο' : 'σχόλια'}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1 md:gap-3 self-center shrink-0">
                            <span className="text-xs md:text-sm text-muted-foreground font-medium">
                                {articleCount} {articleCount === 1 ? 'άρθρο' : 'άρθρα'}
                            </span>
                            <ChevronDown className={`h-4 w-4 md:h-5 md:w-5 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center self-center">
                        <PermalinkButton entityId={chapter.id} view="document" />
                    </div>
                </div>

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

                        {active && (
                            <ViewLink href={commentHref} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#9a3412] underline-offset-2 hover:underline">
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                                Σχολιάστε όλο το κεφάλαιο
                            </ViewLink>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
