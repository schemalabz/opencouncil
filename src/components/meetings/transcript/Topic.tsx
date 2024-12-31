import { Badge } from "@/components/ui/badge";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count }: { topic: Topic, count?: number }) {
    return (
        <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-full" style={{ backgroundColor: topic.colorHex + '20' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: topic.colorHex }} />
            <span className="text-sm" style={{ color: topic.colorHex }}>{topic.name}</span>
        </div>
    );
}