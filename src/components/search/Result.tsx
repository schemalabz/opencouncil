import { Card, CardContent } from "@/components/ui/card";
import { useCouncilMeetingData } from "../meetings/CouncilMeetingDataContext";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { UserBadge } from "../user/UserBadge";

export function Result({ result, className }: { result: any, className?: string }) {
    const { getSpeakerTag, getPerson, getParty } = useCouncilMeetingData();
    const router = useRouter();

    const speakerTag = getSpeakerTag(result.speakerTagId);
    const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
    const party = person?.partyId ? getParty(person.partyId) : undefined;

    const handleClick = () => {
        const timeParam = `t=${Math.floor(result.startTimestamp)}`;
        router.push(`/${result.cityId}/${result.meetingId}/transcript?${timeParam}`);
    };

    return (
        <Card className={cn("cursor-pointer hover:shadow-md", className)} onClick={handleClick}>
            <CardContent className="p-4">
                <div className="flex items-start space-x-4">
                    <UserBadge
                        imageUrl={person?.image || null}
                        name={person?.name_short || speakerTag?.label || ''}
                        role={person?.role || null}
                        party={party || null}
                        withBorder={true}
                    />
                    <div className="flex-grow">
                        <p className="text-sm">{result.text}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}