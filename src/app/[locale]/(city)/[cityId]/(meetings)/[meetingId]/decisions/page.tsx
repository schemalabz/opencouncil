import { notFound } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { MeetingDecisionsPage } from '@/components/meetings/decisions/MeetingDecisionsPage';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';

// Admin-only today; the route is a sibling of the public meeting tabs so a
// future public decisions view can relax the gate without moving the URL.
export default async function DecisionsPage(props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const { cityId, meetingId } = await props.params;
    const editable = await isUserAuthorizedToEdit({ cityId });
    if (!editable) notFound();
    const [user, bodySettings] = await Promise.all([getCurrentUser(), getMeetingBodySettings(cityId, meetingId)]);
    return <MeetingDecisionsPage isSuperAdmin={user?.isSuperAdmin ?? false} bodySettings={bodySettings} />;
}
