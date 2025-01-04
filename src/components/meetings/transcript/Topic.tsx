import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count, className }: { topic: Topic, count?: number, className?: string }) {
    return (
        <div className={cn("mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-full", className)} style={{ backgroundColor: topic.colorHex + '20' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: topic.colorHex }} />
            <span className="text-sm" style={{ color: topic.colorHex }}>{topic.name}</span>
            {count !== undefined && (
                <span className="text-xs" style={{ color: topic.colorHex }}>({count})</span>
            )}
        </div>
    );
}