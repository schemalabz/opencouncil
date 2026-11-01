import { notFound } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { MeetingDecisionsPage } from '@/components/meetings/decisions/MeetingDecisionsPage';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';
import { getReadinessFacts } from '@/lib/db/documentSends';
import { documentState } from '@/lib/documents/status';

// Admin-only today; the route is a sibling of the public meeting tabs so a
// future public decisions view can relax the gate without moving the URL.
export default async function DecisionsPage(props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const { cityId, meetingId } = await props.params;
    const editable = await isUserAuthorizedToEdit({ cityId });
    if (!editable) notFound();
    const [user, bodySettings, readinessFacts] = await Promise.all([
        getCurrentUser(),
        getMeetingBodySettings(cityId, meetingId),
        getReadinessFacts(cityId, meetingId),
    ]);
    // The minutes line shows only for a body that sends its minutes (#874)
    const minutes = readinessFacts && documentState(readinessFacts, 'minutes', new Date());
    const minutesSend = minutes && minutes.state !== 'notEnabled' ? minutes : null;
    return <MeetingDecisionsPage isSuperAdmin={user?.isSuperAdmin ?? false} bodySettings={bodySettings} minutesSend={minutesSend} />;
}
