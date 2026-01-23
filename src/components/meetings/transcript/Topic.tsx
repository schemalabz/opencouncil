import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count, className, size = "default" }: { topic: Topic, count?: number, className?: string, size?: "default" | "compact" }) {
    const sizeClasses = size === "compact"
        ? "mt-0 py-0.5 px-1.5 gap-1.5"
        : "mt-2 py-1 px-2 gap-2";
    const textSize = size === "compact" ? "text-xs" : "text-sm";
    const dotSize = size === "compact" ? "w-1.5 h-1.5" : "w-2 h-2";

    return (
        <div className={cn("inline-flex items-center rounded-full", sizeClasses, className)} style={{ backgroundColor: topic.colorHex + '20' }}>
            <div className={cn("rounded-full", dotSize)} style={{ backgroundColor: topic.colorHex }} />
            <span className={textSize} style={{ color: topic.colorHex }}>{topic.name}</span>
            {count !== undefined && (
                <span className="text-xs" style={{ color: topic.colorHex }}>({count})</span>
            )}
        </div>
    );
}