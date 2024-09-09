import { Badge } from "@/components/ui/badge";
import { Topic } from "@prisma/client";

export default function TopicBadge({ topic }: { topic: Topic }) {
    const color = topic.colorHex;
    const name = topic.name;

    return (
        <Badge style={{ backgroundColor: color }} className="mx-1">
            {name}
        </Badge>
    );
}