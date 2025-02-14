import Header from "@/components/layout/Header";
import { headers } from "next/headers";
import { getMeetingData } from "@/lib/getMeetingData";
import { PathElement } from "@/components/layout/Header";
import { getCity } from "@/lib/db/cities";
import Footer from "@/components/layout/Footer";

export default async function CityInnerLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {

    const city = await getCity(cityId);
    if (!city) return null;

    // Get the current path to determine if we're in a meeting
    const headersList = headers();
    const pathname = headersList.get("x-pathname") || "";
    const meetingMatch = pathname.match(/\/meetings\/([^\/]+)/);
    const meetingId = meetingMatch ? meetingMatch[1] : null;

    // Build the path elements
    const pathElements: PathElement[] = [
        {
            name: city.name,
            link: `/${cityId}`,
            city: city
        }
    ];

    // If we're in a meeting, add the meeting path element
    if (meetingId) {
        const meetingData = await getMeetingData(cityId, meetingId);
        if (meetingData?.meeting) {
            pathElements.push({
                name: meetingData.meeting.name,
                link: `/${cityId}/meetings/${meetingId}`,
                description: new Date(meetingData.meeting.dateTime).toLocaleDateString()
            });
        }
    }

    return (
        <>
            <Header
                path={pathElements}
                showSidebarTrigger={!!meetingId}
                currentEntity={{ cityId: city.id }}
            />
            {children}
            <Footer />
        </>
    );
}
