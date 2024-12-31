"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ImageOrInitials } from "./ImageOrInitials";

interface Avatar {
    imageUrl: string | null;
    profileUrl: string;
    name?: string;
    color?: string;
}

interface AvatarListProps {
    className?: string;
    numPeople?: number;
    avatars: Avatar[];
}

const AvatarList = ({
    numPeople,
    className,
    avatars,
}: AvatarListProps) => {
    return (
        <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
            {avatars.map((avatar, index) => (
                <a
                    key={index}
                    href={avatar.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-2 border-white dark:border-gray-800 rounded-full hover:no-underline"
                >
                    <ImageOrInitials
                        imageUrl={avatar.imageUrl}
                        name={avatar.name}
                        color={avatar.color}
                        width={40}
                        height={40}
                    />
                </a>
            ))}
            {(numPeople ?? 0) > 0 && (
                <a
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-black text-center text-xs font-medium text-white hover:bg-gray-600 dark:border-gray-800 dark:bg-white dark:text-black"
                    href=""
                >
                    +{numPeople}
                </a>
            )}
        </div>
    );
};

export default AvatarList;
