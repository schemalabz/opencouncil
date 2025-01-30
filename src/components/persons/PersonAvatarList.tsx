import { Person, Party } from "@prisma/client";
import { PersonBadge } from "./PersonBadge";
import { cn } from "@/lib/utils";
import { Pen } from "lucide-react";

interface PersonAvatarListProps {
    users: (Person & { party: Party | null, isIntroducer?: boolean })[];
    className?: string;
    maxDisplayed?: number;
    numMore?: number;
}

export function PersonAvatarList({
    users,
    className,
    maxDisplayed = 5,
    numMore,
}: PersonAvatarListProps) {
    const displayCount = Math.min(users.length, maxDisplayed);
    const remainingCount = numMore ?? (users.length - displayCount);

    return (
        <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
            {users.slice(0, displayCount).map((user) => (
                <div key={user.id} onClick={(e) => e.stopPropagation()} className="relative">
                    <PersonBadge
                        person={user}
                        short
                    />
                    {user.isIntroducer && (
                        <div className="absolute top-0 left-0 bg-background rounded-full w-4 h-4 flex items-center justify-center ring-[1.5px] ring-background">
                            <Pen className="w-2.5 h-2.5 text-foreground" />
                        </div>
                    )}
                </div>
            ))}
            {remainingCount > 0 && (
                <div className="inline-flex items-center py-1 pr-1">
                    <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-muted text-center text-sm font-medium text-muted-foreground">
                        +{remainingCount}
                    </div>
                </div>
            )}
        </div>
    );
}