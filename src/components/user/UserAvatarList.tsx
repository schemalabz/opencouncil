import React from "react";
import { cn } from "@/lib/utils";
import { UserBadge } from "./UserBadge";
import { Person, Party } from "@prisma/client";

interface UserAvatarListProps {
    users: (Person & { party?: Party | null })[];
    className?: string;
    numMore?: number;
}

export function UserAvatarList({
    users,
    className,
    numMore,
}: UserAvatarListProps) {
    return (
        <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
            {users.map((user, index) => (
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
            {(numMore ?? 0) > 0 && (
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-center text-xs font-medium text-white hover:bg-gray-600 dark:bg-white dark:text-black"
                >
                    +{numMore}
                </div>
            )}
        </div>
    );
} 