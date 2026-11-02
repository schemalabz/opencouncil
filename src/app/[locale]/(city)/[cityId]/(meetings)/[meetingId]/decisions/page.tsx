import { notFound } from 'next/navigation';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { MeetingDecisionsPage } from '@/components/meetings/decisions/MeetingDecisionsPage';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';

// Admin-only today; the route is a sibling of the public meeting tabs so a
// future public decisions view can relax the gate without moving the URL.
export default async function DecisionsPage(props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const { cityId, meetingId } = await props.params;
    const editable = await isUserAuthorizedToEdit({ cityId });
    if (!editable) notFound();
    const bodySettings = await getMeetingBodySettings(cityId, meetingId);
    // The destructive extraction actions follow the `admin` right on the
    // city, which the gate above holds.
    return <MeetingDecisionsPage isSuperAdmin={editable} bodySettings={bodySettings} />;
}
