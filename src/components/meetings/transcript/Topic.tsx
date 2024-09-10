import { Badge } from "@/components/ui/badge";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic, count }: { topic: Topic, count?: number }) {
    const color = topic.colorHex;
    const name = topic.name;

    return (
        <Badge style={{ borderColor: color }} className="border-2 bg-background text-foreground mx-1 text-center hover:bg-background/80">
            {name} {count ? `(${count})` : ''}
        </Badge>
    );
}