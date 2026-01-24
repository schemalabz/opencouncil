import { Subject, Topic, Party, Person } from "@prisma/client";
import { cn } from "@/lib/utils";
import Icon from "./icon";
import { PersonAvatarList } from "./persons/PersonAvatarList";
import { useRouter } from "next/navigation";
import { stripMarkdown } from "@/lib/formatters/markdown";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";

interface SubjectBadgeProps {
    subject: Subject & {
        topic?: Topic | null,
        statistics?: Statistics
    };
    className?: string;
}

export default function SubjectBadge({ subject, className }: SubjectBadgeProps) {
    const router = useRouter();
    const backgroundColor = subject.topic?.colorHex ? subject.topic.colorHex + "15" : "transparent";


    const badge = (
        <div
            className={cn(
                "mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-full cursor-pointer transition-transform duration-200 hover:scale-105",
                className
            )}
        >
            <div className="p-1 rounded-full" style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}>
                <Icon name={subject.topic?.icon as any || "Hash"} color={subject.topic?.colorHex || "#9ca3af"} size={16} />
            </div>
            <span className="text-sm" >{subject.name}</span>
        </div>
    );

    return (
        <Popover>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                {badge}
            </PopoverTrigger>
            <PopoverContent
                className={cn("w-80 cursor-pointer")}
                onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/${subject.cityId}/${subject.councilMeetingId}/subjects/${subject.id}`);
                }}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full" style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={subject.topic?.icon as any || "Hash"} color={subject.topic?.colorHex || "#9ca3af"} size={24} />
                        </div>
                        <div>
                            <div className="font-semibold">{subject.name}</div>
                            {subject.description && (
                                <div className="text-sm text-muted-foreground line-clamp-2">{stripMarkdown(subject.description)}</div>
                            )}
                        </div>
                    </div>

                </div>
            </PopoverContent>
        </Popover>
    );
}
