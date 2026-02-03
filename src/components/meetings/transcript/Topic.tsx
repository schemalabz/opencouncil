import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count, className, size = "default" }: { topic: Topic, count?: number, className?: string, size?: "default" | "compact" }) {
    const sizeClasses = size === "compact"
        ? "mt-0 py-0.5 px-1.5 gap-1.5"
        : "mt-1 sm:mt-2 py-0.5 sm:py-1 px-1.5 sm:px-2 gap-1 sm:gap-2";
    const textSize = size === "compact" ? "text-xs" : "text-[10px] sm:text-sm";
    const dotSize = size === "compact" ? "w-1.5 h-1.5" : "w-1.5 h-1.5 sm:w-2 sm:h-2";

    return (
        <div className={cn("inline-flex items-center rounded-full", sizeClasses, className)} style={{ backgroundColor: topic.colorHex + '20' }}>
            <div className={cn("rounded-full shrink-0", dotSize)} style={{ backgroundColor: topic.colorHex }} />
            <span className={cn("truncate", textSize)} style={{ color: topic.colorHex }}>{topic.name}</span>
            {count !== undefined && (
                <span className="text-[9px] sm:text-xs shrink-0" style={{ color: topic.colorHex }}>({count})</span>
            )}
        </div>
    );
}