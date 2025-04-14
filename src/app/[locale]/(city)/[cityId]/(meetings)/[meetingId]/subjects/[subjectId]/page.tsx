import { Metadata } from "next";
import Subject from "@/components/meetings/subject/subject";
import { getMeetingDataCached, getSubjectFromMeetingCached } from "@/lib/cache";

export async function generateMetadata({
    params,
}: {
    params: { cityId: string; meetingId: string; subjectId: string };
}): Promise<Metadata> {
    try {
        // First try to get the subject from the cached meeting data
        const subject = await getSubjectFromMeetingCached(params.cityId, params.meetingId, params.subjectId);

        if (!subject) {
            return { title: "Subject not found" };
        }

        // Get the full meeting data for city information
        const meetingData = await getMeetingDataCached(params.cityId, params.meetingId);

        if (!meetingData) {
            return { title: subject.name };
        }

        // Create a concise title
        const title = `${meetingData.city.name} - ${subject.name} | OpenCouncil`;

        // Create a meaningful description
        const description =
            subject.description ||
            `Θέμα που συζητήθηκε στο δημοτικό συμβούλιο ${meetingData.city.name} στις ${new Date(meetingData.meeting.dateTime).toLocaleDateString("el-GR")}`;

        return {
            title,
            description,
            openGraph: {
                title,
                description,
            },
            twitter: {
                card: "summary_large_image",
                title,
                description,
            },
        };
    } catch (error) {
        console.error("Error generating subject metadata:", error);
        return { title: "Subject" };
    }
}

// Server component that renders the Subject component
export default function SubjectPage({ params }: { params: { cityId: string; meetingId: string; subjectId: string } }) {
    return <Subject subjectId={params.subjectId} />;
}
