import type React from "react";
import fs from "fs";
import path from "path";

// Load and convert the logo to base64
let logoBase64: string;
try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logo = fs.readFileSync(logoPath);
    logoBase64 = `data:image/png;base64,${logo.toString("base64")}`;
} catch (error) {
    console.error("Failed to load logo:", error);
    // Fallback to empty string if logo can't be loaded
    logoBase64 = "";
}

interface OpenCouncilWatermarkProps {
    size?: number;
    fontSize?: number;
    bottom?: number;
    right?: number;
}

// Shared watermark component
export const OpenCouncilWatermark = ({
    size = 40,
    fontSize = 21,
    bottom = 40,
    right = 40,
}: OpenCouncilWatermarkProps = {}) => (
    <div
        style={{
            position: "absolute",
            bottom: `${bottom}px`,
            right: `${right}px`,
            display: "flex",
            alignItems: "center",
            opacity: 0.7,
        }}
    >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoBase64} width={size} height={size} alt='OpenCouncil' style={{ marginRight: "8px" }} />
        <span
            style={{
                fontSize: `${fontSize}px`,
                fontWeight: 500,
                color: "#6b7280",
            }}
        >
            OpenCouncil
        </span>
    </div>
);

// Shared container component
interface ContainerProps {
    children: React.ReactNode;
    watermarkProps?: OpenCouncilWatermarkProps;
}

export const Container = ({ children, watermarkProps }: ContainerProps) => (
    <div
        style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#ffffff",
            padding: "48px",
            position: "relative",
        }}
    >
        {children}
        <OpenCouncilWatermark {...watermarkProps} />
    </div>
);

interface MeetingMetaRowProps {
    formattedDate: string;
    subjectsCount: number;
    fontSize?: number;
    gap?: number;
    iconGap?: number;
    color?: string;
    stacked?: boolean;
    stackGap?: number;
    separator?: boolean;
    separatorSize?: number;
    separatorColor?: string;
}

export const MeetingMetaRow = ({
    formattedDate,
    subjectsCount,
    fontSize = 28,
    gap = 24,
    iconGap = 8,
    color = "#4b5563",
    stacked = false,
    stackGap = 18,
    separator,
    separatorSize = 4,
    separatorColor = "#9ca3af",
}: MeetingMetaRowProps) => {
    const useSeparator = separator ?? !stacked;

    if (stacked) {
        return (
            <div style={{ display: "flex", flexDirection: "column", color, fontSize: `${fontSize}px` }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: `${stackGap}px` }}>
                    <span style={{ marginRight: `${iconGap}px` }}>📅</span>
                    <span>{formattedDate}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ marginRight: `${iconGap}px` }}>📋</span>
                    <span>{subjectsCount} Θέματα</span>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center", color, fontSize: `${fontSize}px` }}>
            <div style={{ display: "flex", alignItems: "center", marginRight: `${gap}px` }}>
                <span style={{ marginRight: `${iconGap}px` }}>📅</span>
                <span>{formattedDate}</span>
            </div>
            {useSeparator && (
                <div
                    style={{
                        width: `${separatorSize}px`,
                        height: `${separatorSize}px`,
                        borderRadius: "50%",
                        background: separatorColor,
                        marginRight: `${gap}px`,
                    }}
                />
            )}
            <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ marginRight: `${iconGap}px` }}>📋</span>
                <span>{subjectsCount} Θέματα</span>
            </div>
        </div>
    );
};

interface SubjectTopic {
    colorHex?: string | null;
}

interface SubjectWithTopic {
    id: string;
    name: string;
    topic?: SubjectTopic | null;
}

interface SubjectPillsStyle {
    containerGap?: number;
    containerMarginTop?: number;
    pillPadding?: [number, number];
    pillRadius?: number;
    pillFontSize?: number;
    pillFontWeight?: number;
    pillBoxShadow?: string;
    pillMaxWidth?: string;
    pillWidth?: string;
    remainingFontSize?: number;
    remainingMarginTop?: number;
    remainingColor?: string;
}

interface SubjectPillsProps {
    subjects: SubjectWithTopic[];
    limit: number;
    styles?: SubjectPillsStyle;
    remainingLabel?: (remainingCount: number) => string;
}

export const SubjectPills = ({
    subjects,
    limit,
    styles = {},
    remainingLabel,
}: SubjectPillsProps) => {
    const {
        containerGap = 12,
        containerMarginTop = 12,
        pillPadding = [12, 24],
        pillRadius = 9999,
        pillFontSize = 24,
        pillFontWeight = 700,
        pillBoxShadow = "none",
        pillMaxWidth = "100%",
        pillWidth,
        remainingFontSize = 20,
        remainingMarginTop = 4,
        remainingColor = "#6b7280",
    } = styles;

    const topSubjects = subjects.slice(0, limit);
    const remainingCount = Math.max(0, subjects.length - limit);

    if (topSubjects.length === 0) return null;

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                marginTop: `${containerMarginTop}px`,
            }}
        >
            {topSubjects.map((subject, index) => {
                const pillStyle: Record<string, string | number> = {
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: subject.topic?.colorHex || "#e5e7eb",
                    padding: `${pillPadding[0]}px ${pillPadding[1]}px`,
                    borderRadius: `${pillRadius}px`,
                    color: "#ffffff",
                    fontSize: `${pillFontSize}px`,
                    fontWeight: pillFontWeight,
                    boxShadow: pillBoxShadow,
                    maxWidth: pillMaxWidth,
                };
                
                if (pillWidth) {
                    pillStyle.width = pillWidth;
                }
                
                if (index < topSubjects.length - 1) {
                    pillStyle.marginBottom = `${containerGap}px`;
                }

                return (
                    <div key={subject.id} style={pillStyle}>
                        <span
                            style={{
                                display: "flex",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {subject.name}
                        </span>
                    </div>
                );
            })}
            {remainingCount > 0 && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        color: remainingColor,
                        fontSize: `${remainingFontSize}px`,
                        marginTop: `${remainingMarginTop}px`,
                    }}
                >
                    <span style={{ display: "flex" }}>
                        {remainingLabel ? remainingLabel(remainingCount) : `+${remainingCount} ακόμα θέματα`}
                    </span>
                </div>
            )}
        </div>
    );
};

// Shared OG Header component
interface OgHeaderProps {
    city: {
        name: string;
        logoImage: string | null;
    };
    meeting?: {
        name: string;
        dateFormatted: string;
    };
}

export const OgHeader = ({ city, meeting }: OgHeaderProps) => (
    <div
        style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom: "40px",
        }}
    >
        <div
            style={{
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                width: "100%",
            }}
        >
            {/* City logo and name */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                }}
            >
                {city.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={city.logoImage}
                        height="80"
                        alt="City Logo"
                        style={{
                            objectFit: "contain",
                            marginRight: "20px",
                        }}
                    />
                )}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <span
                        style={{
                            fontSize: "32px",
                            fontWeight: 600,
                            color: "#1f2937",
                            display: "flex",
                        }}
                    >
                        {city.name}
                    </span>
                </div>
            </div>

            {/* Add meeting info if provided */}
            {meeting && (
                <>
                    {/* Separator */}
                    <div
                        style={{
                            width: "1px",
                            height: "48px",
                            backgroundColor: "#e5e7eb",
                            margin: "0 20px",
                        }}
                    />

                    {/* Meeting info */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            flexShrink: 1,
                        }}
                    >
                        <span
                            style={{
                                fontSize: "28px",
                                color: "#6b7280",
                                display: "flex",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {meeting.name}
                        </span>
                        <span
                            style={{
                                fontSize: "20px",
                                color: "#9ca3af",
                                display: "flex",
                            }}
                        >
                            {meeting.dateFormatted}
                        </span>
                    </div>
                </>
            )}
        </div>
    </div>
);
