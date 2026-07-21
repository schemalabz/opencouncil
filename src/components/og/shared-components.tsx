import type React from "react";

// Note: this file is imported from BOTH server (next/og render) and client
// (html-to-image rasterization) contexts. Keep it free of Node-only imports.
// Logo data is supplied by callers via the `logoSrc` prop — server callers pass
// data URIs (see src/lib/og/serverAssets.ts), client callers pass URL paths.

export function formatCityDisplayName(cityName: string, adminBodyName?: string | null): string {
    return adminBodyName ? `${cityName} · ${adminBodyName}` : cityName;
}

// Logo aspect ratio: 1606x1354
const LOGO_ASPECT_RATIO = 1606 / 1354;

interface OpenCouncilWatermarkProps {
    /**
     * Image source for the OpenCouncil logo. Server callers should pass a data URI
     * loaded via src/lib/og/serverAssets.ts (so satori doesn't network-fetch).
     * Client callers should pass a same-origin URL like "/logo.png" or "/white-logo.png".
     */
    logoSrc: string;
    size?: number;
    fontSize?: number;
    bottom?: number;
    right?: number;
    logoOnly?: boolean;
}

// Shared watermark component
export const OpenCouncilWatermark = ({
    logoSrc,
    size = 40,
    fontSize = 21,
    bottom = 40,
    right = 40,
    logoOnly = false,
}: OpenCouncilWatermarkProps) => {
    const logoWidth = Math.round(size * LOGO_ASPECT_RATIO);

    return (
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
            <img src={logoSrc} width={logoWidth} height={size} alt='OpenCouncil' style={{ marginRight: logoOnly ? "0" : "8px" }} />
            {!logoOnly && (
                <span
                    style={{
                        fontSize: `${fontSize}px`,
                        fontWeight: 500,
                        color: "#6b7280",
                    }}
                >
                    OpenCouncil
                </span>
            )}
        </div>
    );
};

// Shared container component
interface ContainerProps {
    children: React.ReactNode;
    /** Image source for the watermark logo. See OpenCouncilWatermark.logoSrc. */
    watermarkLogoSrc: string;
    watermarkProps?: Omit<OpenCouncilWatermarkProps, "logoSrc">;
    containerPadding?: string;
}

export const Container = ({
    children,
    watermarkLogoSrc,
    watermarkProps,
    containerPadding = "48px",
}: ContainerProps) => (
    <div
        style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#ffffff",
            padding: containerPadding,
            position: "relative",
        }}
    >
        {children}
        <OpenCouncilWatermark {...watermarkProps} logoSrc={watermarkLogoSrc} />
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

// Dark 1200x630 hero scaffold shared by the marketing-page OG images
// (about, explain): wordmark top-left, two-line headline with an orange accent
// line, an optional middle band (stat pills and/or subtitle), and a row of
// orange tags along the bottom.
interface DarkHeroOGImageProps {
    /** Headline as two pre-split lines (white, then orange) to avoid flexWrap. */
    headline: [string, string];
    /** Neutral stat pills under the headline, e.g. "10 δήμοι". */
    statPills?: string[];
    /** One-sentence subtitle under the headline. */
    subtitle?: string;
    /** Orange tags along the bottom edge. */
    tags: string[];
}

const darkHeroHeadlineStyle = {
    fontSize: "56px",
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
};

export const DarkHeroOGImage = ({ headline, statPills, subtitle, tags }: DarkHeroOGImageProps) => (
    <div
        style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0a0a0a",
            padding: "60px 72px",
        }}
    >
        {/* Logo / wordmark top-left */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "56px" }}>
            <div style={{ fontSize: "22px", fontWeight: "600", color: "#ffffff" }}>OpenCouncil</div>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "32px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ ...darkHeroHeadlineStyle, fontWeight: "300", color: "#ffffff" }}>{headline[0]}</div>
                <div style={{ ...darkHeroHeadlineStyle, fontWeight: "500", color: "#f97316" }}>{headline[1]}</div>
            </div>

            {statPills && (
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    {statPills.map((label) => (
                        <div
                            key={label}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                backgroundColor: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "100px",
                                padding: "8px 20px",
                                fontSize: "20px",
                                color: "rgba(255,255,255,0.75)",
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>
            )}

            {subtitle && (
                <div
                    style={{
                        fontSize: "24px",
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.4,
                        maxWidth: "900px",
                    }}
                >
                    {subtitle}
                </div>
            )}
        </div>

        {/* Tags bottom */}
        <div style={{ display: "flex", gap: "12px", marginTop: "40px" }}>
            {tags.map((tag) => (
                <div
                    key={tag}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: "rgba(249,115,22,0.12)",
                        border: "1px solid rgba(249,115,22,0.3)",
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "16px",
                        color: "#f97316",
                        fontWeight: "500",
                    }}
                >
                    {tag}
                </div>
            ))}
        </div>
    </div>
);

// Shared OG Header component
interface OgHeaderProps {
    city: {
        name: string;
        logoImage: string | null;
    };
    logoHeight?: number;
    nameSize?: number;
    marginBottom?: string;
}

export const OgHeader = ({
    city,
    logoHeight = 80,
    nameSize = 32,
    marginBottom = "40px"
}: OgHeaderProps) => (
    <div
        style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom,
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
                        height={logoHeight}
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
                            fontSize: `${nameSize}px`,
                            fontWeight: 600,
                            color: "#1f2937",
                            display: "flex",
                        }}
                    >
                        {city.name}
                    </span>
                </div>
            </div>

        </div>
    </div>
);
