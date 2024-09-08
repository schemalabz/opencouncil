import { type City, type Party, type Person, type CouncilMeeting } from "@prisma/client";
import { isEditMode } from "./utils";

export function withUserAuthorizedToEdit({
    cityId,
    partyId,
    personId,
    councilMeetingId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"]
    root?: boolean
}) {
    return isEditMode();
}