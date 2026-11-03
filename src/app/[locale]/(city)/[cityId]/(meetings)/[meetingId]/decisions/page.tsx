import { notFound } from 'next/navigation';
import { hasRight } from '@/lib/auth';
import { MeetingDecisionsPage } from '@/components/meetings/decisions/MeetingDecisionsPage';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';

// The route is a sibling of the public meeting tabs so a future public
// decisions view can relax the gate without moving the URL.
export default async function DecisionsPage(props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const { cityId, meetingId } = await props.params;
    const canRead = await hasRight('records.read', { cityId, councilMeetingId: meetingId });
    if (!canRead) notFound();
    // The destructive extraction actions and the audit controls follow the
    // `admin` right on the city, the same right their routes check.
    const [cityAdmin, bodySettings] = await Promise.all([
        hasRight('admin', { cityId }),
        getMeetingBodySettings(cityId, meetingId),
    ]);
    return <MeetingDecisionsPage cityAdmin={cityAdmin} bodySettings={bodySettings} />;
}
