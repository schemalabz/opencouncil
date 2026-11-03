import { notFound } from 'next/navigation';
import { hasRight, isUserAuthorizedToEdit } from '@/lib/auth';
import { MeetingDecisionsPage } from '@/components/meetings/decisions/MeetingDecisionsPage';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';

// The route is a sibling of the public meeting tabs so a future public
// decisions view can relax the gate without moving the URL.
export default async function DecisionsPage(props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const { cityId, meetingId } = await props.params;
    const [canRead, editable] = await Promise.all([
        hasRight('records.read', { cityId, councilMeetingId: meetingId }),
        // The destructive extraction actions follow the `admin` right on the city.
        isUserAuthorizedToEdit({ cityId }),
    ]);
    if (!canRead) notFound();
    const bodySettings = await getMeetingBodySettings(cityId, meetingId);
    return <MeetingDecisionsPage isSuperAdmin={editable} bodySettings={bodySettings} />;
}
