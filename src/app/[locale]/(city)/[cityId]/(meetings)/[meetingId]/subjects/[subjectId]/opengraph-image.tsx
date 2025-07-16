import { ImageResponse } from "next/og";
import { Container, OgHeader } from "@/components/og/shared-components";
import { getSubjectDataForOG } from "@/lib/db/subject";
import { formatDate } from "date-fns";
import { el, enUS } from "date-fns/locale";
import { PersonWithRelations } from '@/lib/db/people';
import { ColorPercentageRingProps } from "@/components/ui/color-percentage-ring";

// Image configuration
export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

// Function to create color percentage ring for OG image
// Follows the same design src/components/ui/color-percentage-ring.tsx
function ColorPercentageRing({
    data,
    totalMinutes,
    size = 120,
    thickness = 14,
    emptyColor = "#e5e7eb",
}: Omit<ColorPercentageRingProps, "children"> & {
    totalMinutes: number;
}) {
    const radius = size / 2;
    let startAngle = 0;

    // Calculate total percentage
    const totalPercentage = data.reduce((sum, item) => sum + item.percentage, 0);

    // Create a copy of data with sorted percentages (largest first) for better visual appearance
    const sortedData = [...data].sort((a, b) => b.percentage - a.percentage);

    // Add remaining percentage if total is less than 100
    const dataWithEmpty =
        totalPercentage < 100 ? [...sortedData, { color: emptyColor, percentage: 100 - totalPercentage }] : sortedData;

    // Function to describe arc paths for the ring
    function describeArc(
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        thickness: number,
    ) {
        const innerStart = polarToCartesian(x, y, radius - thickness, endAngle);
        const innerEnd = polarToCartesian(x, y, radius - thickness, startAngle);
        const outerStart = polarToCartesian(x, y, radius, endAngle);
        const outerEnd = polarToCartesian(x, y, radius, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M",
            innerStart.x,
            innerStart.y,
            "A",
            radius - thickness,
            radius - thickness,
            0,
            largeArcFlag,
            0,
            innerEnd.x,
            innerEnd.y,
            "L",
            outerEnd.x,
            outerEnd.y,
            "A",
            radius,
            radius,
            0,
            largeArcFlag,
            1,
            outerStart.x,
            outerStart.y,
            "L",
            innerStart.x,
            innerStart.y,
            "Z",
        ].join(" ");
    }

    function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerX + radius * Math.cos(angleInRadians),
            y: centerY + radius * Math.sin(angleInRadians),
        };
    }

    return (
        <div style={{ position: "relative", display: "flex" }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
                {/* Background circle */}
                <path d={describeArc(radius, radius, radius, 0, 360, thickness)} fill='#f3f4f6' />

                {dataWithEmpty.map((item, index) => {
                    const endAngle = startAngle + (item.percentage / 100) * 360;
                    const path = describeArc(radius, radius, radius, startAngle, endAngle, thickness);
                    const currentStartAngle = startAngle;
                    startAngle = endAngle;

                    return <path key={index} d={path} fill={item.color} />;
                })}
            </svg>

            {/* Number display positioned in the center of the ring */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    flexDirection: "column",
                }}
            >
                <div
                    style={{
                        fontSize: 56,
                        fontWeight: 600,
                        color: "#111827",
                        display: "flex",
                    }}
                >
                    {totalMinutes}
                </div>
                <div
                    style={{
                        fontSize: 22,
                        color: "#6b7280",
                        display: "flex",
                    }}
                >
                    λεπτά
                </div>
            </div>
        </div>
    );
}

// Generate the OpenGraph image for subject pages
export default async function SubjectOgImage({
    params,
}: {
    params: {
        locale: string;
        cityId: string;
        meetingId: string;
        subjectId: string;
    };
}) {
    const data = await getSubjectDataForOG(params.cityId, params.meetingId, params.subjectId);

    // Return a blank image if no data
    if (!data) {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: "#ffffff",
                        display: "flex",
                    }}
                />
            ),
            { ...size },
        );
    }

    // Calculate total speaking time in seconds
    const totalSeconds = data.subject.speakerSegments.reduce((total, segment) => {
        const duration = segment.speakerSegment.endTimestamp - segment.speakerSegment.startTimestamp;
        return total + duration;
    }, 0);

    // Convert to minutes and round to nearest minute
    const totalMinutes = Math.round(totalSeconds / 60);

    // Get top speaker IDs from statistics
    const topSpeakersIds =
        data.statistics?.people?.sort((a, b) => b.speakingSeconds - a.speakingSeconds).map(p => p.item.id) || [];

    // Add the introducer at the start if they exist and aren't already in top speakers
    const introducedByPerson = data.subject.introducedBy;
    if (introducedByPerson && !topSpeakersIds.includes(introducedByPerson.id)) {
        topSpeakersIds.unshift(introducedByPerson.id);
    }

    // Filter and sort to get top speakers
    const topSpeakers = topSpeakersIds
        .map(id => data.people.find(p => p.id === id))
        .filter((p): p is PersonWithRelations => p !== undefined);

    // Prepare color percentages data for the ring
    const colorPercentages =
        data.statistics?.parties?.map(p => ({
            color: p.item.colorHex,
            percentage: (p.speakingSeconds / data.statistics!.speakingSeconds) * 100,
        })) || [];

    // Format the meeting date for display
    const meetingDate = formatDate(new Date(data.meeting.dateTime), "EEEE, d MMMM yyyy", {
        locale: params.locale === "el" ? el : enUS,
    });

    return new ImageResponse(
        (
            <Container>
                {/* Color Percentage Ring in the absolute top right corner */}
                <div
                    style={{
                        position: "absolute",
                        top: "50px", // Some padding from the top edge
                        right: "50px", // Some padding from the right edge
                        display: "flex",
                    }}
                >
                    <ColorPercentageRing
                        data={colorPercentages}
                        totalMinutes={totalMinutes}
                        size={180}
                        thickness={20}
                    />
                </div>

                <OgHeader
                    city={{
                        name: data.city.name_municipality,
                        logoImage: data.city.logoImage,
                    }}
                    meeting={{
                        name: data.meeting.name,
                        dateFormatted: meetingDate,
                    }}
                />

                {/* Main Layout */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                    }}
                >
                    {/* Subject name with padding on the right to make room for the ring */}
                    <h1
                        style={{
                            fontSize: 56,
                            fontWeight: 700,
                            color: "#111827",
                            lineHeight: 1.3,
                            margin: 0,
                            marginBottom: "24px",
                            paddingTop: "8px",
                            paddingRight: "180px", // Make room for the ring
                            display: "flex",
                        }}
                    >
                        {data.subject.name}
                    </h1>

                    {/* Topic and location badges */}
                    <div
                        style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                            flexWrap: "wrap",
                            marginBottom: "24px",
                        }}
                    >
                        {/* Topic badge if available */}
                        {data.subject.topic && (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    backgroundColor: data.subject.topic.colorHex || "#e5e7eb",
                                    padding: "8px 16px",
                                    borderRadius: "6px",
                                    color: "#ffffff",
                                    fontSize: 28,
                                    fontWeight: 600,
                                }}
                            >
                                {/* Circle indicator */}
                                <div
                                    style={{
                                        width: "14px",
                                        height: "14px",
                                        borderRadius: "50%",
                                        backgroundColor: "#ffffff",
                                        display: "flex",
                                    }}
                                />
                                <span style={{ display: "flex" }}>{data.subject.topic.name}</span>
                            </div>
                        )}

                        {/* Location badge if available */}
                        {data.subject.location && (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    backgroundColor: "#f3f4f6",
                                    padding: "8px 16px",
                                    borderRadius: "6px",
                                    color: "#4b5563",
                                    fontSize: 28,
                                    fontWeight: 500,
                                }}
                            >
                                <span style={{ display: "flex" }}>📍</span>
                                <span style={{ display: "flex" }}>{data.subject.location.text}</span>
                            </div>
                        )}
                    </div>

                    {/* Speakers section */}
                    {topSpeakers.length > 0 && (
                        <div
                            style={{
                                marginTop: "32px",
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            {/* Speakers avatar list - styled like src/components/persons/PersonAvatarList.tsx */}
                            <div
                                style={{
                                    display: "flex",
                                    marginLeft: "8px",
                                }}
                            >
                                {topSpeakers.slice(0, 9).map((person, index) => {
                                    // Find party from roles
                                    let partyName: string | null = null;
                                    let partyColor: string | null = null;

                                    if (person.roles && person.roles.length > 0) {
                                        const roleWithParty = person.roles.find(r => r.party);
                                        if (roleWithParty && roleWithParty.party) {
                                            partyName = roleWithParty.party.name_short;
                                            partyColor = roleWithParty.party.colorHex;
                                        }
                                    }

                                    // Check if this is the introducer
                                    const isIntroducer = introducedByPerson && person.id === introducedByPerson.id;

                                    // Get initials (first character of first name and first character of last name)
                                    const nameParts = person.name.split(" ");
                                    const initials =
                                        nameParts.length > 1
                                            ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`
                                            : person.name.substring(0, 2).toUpperCase();

                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                position: "relative",
                                                marginLeft: index === 0 ? "0px" : "-16px", // Create overlap
                                                display: "flex",
                                            }}
                                        >
                                            {/* Person Badge */}
                                            <div
                                                style={{
                                                    position: "relative",
                                                    width: "100px",
                                                    height: "100px",
                                                    borderRadius: "50%",
                                                    backgroundColor: "#ffffff",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    overflow: "hidden",
                                                    border: `5px solid ${partyColor || "#e5e7eb"}`,
                                                    boxShadow:
                                                        "0 6px 8px -1px rgba(0, 0, 0, 0.12), 0 4px 6px -1px rgba(0, 0, 0, 0.08)",
                                                }}
                                            >
                                                {person.image ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={person.image}
                                                        alt={person.name}
                                                        width='100'
                                                        height='100'
                                                        style={{ objectFit: "cover" }}
                                                    />
                                                ) : (
                                                    <span
                                                        style={{
                                                            color: partyColor || "#6b7280",
                                                            fontSize: "36px",
                                                            fontWeight: 600,
                                                            display: "flex",
                                                        }}
                                                    >
                                                        {initials}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Introducer Icon */}
                                            {isIntroducer && (
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        top: "0",
                                                        left: "0",
                                                        backgroundColor: "#ffffff",
                                                        borderRadius: "50%",
                                                        width: "36px",
                                                        height: "36px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        border: "2px solid #ffffff",
                                                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            display: "flex",
                                                            fontSize: "22px",
                                                        }}
                                                    >
                                                        ✏️
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Add +N more if there are more speakers */}
                                {topSpeakers.length > 9 && (
                                    <div
                                        style={{
                                            position: "relative",
                                            marginLeft: "-22px",
                                            display: "flex",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: "100px",
                                                height: "100px",
                                                borderRadius: "50%",
                                                backgroundColor: "#f3f4f6",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                border: "5px solid #ffffff",
                                                boxShadow:
                                                    "0 6px 8px -1px rgba(0, 0, 0, 0.12), 0 4px 6px -1px rgba(0, 0, 0, 0.08)",
                                                color: "#6b7280",
                                                fontSize: "30px",
                                                fontWeight: "600",
                                            }}
                                        >
                                            +{topSpeakers.length - 6}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Container>
        ),
        { ...size },
    );
}
