import React from "react";
import { cn } from "@/lib/utils";
import { UserBadge } from "./UserBadge";
import { Person, Party } from "@prisma/client";

interface UserAvatarListProps {
    users: (Person & { party?: Party | null })[];
    className?: string;
    maxDisplayed?: number;
    numMore?: number;
}

export function UserAvatarList({
    users,
    className,
    maxDisplayed = 5,
    numMore,
}: UserAvatarListProps) {
    const displayCount = Math.min(users.length, maxDisplayed);
    const remainingCount = users.length - displayCount;

    return (
        <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
            {users.slice(0, displayCount).map((user, index) => (
                <div key={user.id} onClick={(e) => e.stopPropagation()}>
                    <UserBadge
                        imageUrl={user.image}
                        name={user.name_short}
                        role={user.role}
                        party={user.party}
                        short={true}
                    />
                </div>
            ))}
            {remainingCount > 0 && (
                <div
                    className="inline-flex items-center py-1 pr-1"
                >
                    <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-muted text-center text-sm font-medium text-muted-foreground">
                        +{remainingCount}
                    </div>
                </div>
            )}
        </div>
    );
}