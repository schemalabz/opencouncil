"use client";

import { SpeakerTag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ImageOrInitials } from "./ImageOrInitials";
import { Party, Person } from "@prisma/client";

export default function SpeakerBadge({ speakerTag, className, handleTagClick, person, party, isSelected, withLeftBorder = false }: { speakerTag: Omit<SpeakerTag, "createdAt" | "updatedAt" | "id">, className?: string, handleTagClick?: () => void, person?: Person, party?: Party, isSelected?: boolean, withLeftBorder?: boolean }) {
    const role = person?.role;
    const isTagged = speakerTag.personId !== null;
    const name = isTagged ? person?.name_short : speakerTag.label;
    const partyColor = party?.colorHex || 'gray';
    return <div
        className={
            cn(`max-w-120 inline-flex items-center py-1 pr-1 cursor-pointer
                            transition-all duration-200 hover:bg-gray-100
                            ${withLeftBorder ? `pl-2 ` : ''}
                            ${isSelected ? 'bg-gray-100' : ''}`
                , className)}
        style={{ borderLeft: withLeftBorder ? `2px solid ${partyColor}` : 'none' }}
        onClick={handleTagClick}
    >
        <ImageOrInitials
            imageUrl={isTagged && person?.image ? person.image : null}
            width={40}
            height={40}
            name={isTagged ? (name ?? '') : undefined}
        />
        <div className='flex-col'>
            <div className="ml-2 font-semibold text-md whitespace-nowrap">{name}</div>
            <div className="ml-2 text-muted-foreground text-sm">
                {role && (
                    <div className="whitespace-nowrap text-ellipsis">{role}</div>
                )}
            </div>
        </div>
    </div>
}
