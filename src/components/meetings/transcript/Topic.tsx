import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count, className }: { topic: Topic, count?: number, className?: string }) {
    return (
        <div className={cn("mt-1 sm:mt-2 inline-flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full", className)} style={{ backgroundColor: topic.colorHex + '20' }}>
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: topic.colorHex }} />
            <span className="text-[10px] sm:text-sm truncate" style={{ color: topic.colorHex }}>{topic.name}</span>
            {count !== undefined && (
                <span className="text-[9px] sm:text-xs shrink-0" style={{ color: topic.colorHex }}>({count})</span>
            )}
        </div>
    );
}