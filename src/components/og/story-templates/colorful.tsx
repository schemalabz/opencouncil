// T4 — Colorful: peach background, rotated "Συνεδρίαση" sticker, date pill, tilted subject stickers.

import { format } from "date-fns";
import { el } from "date-fns/locale";
import { OpenCouncilWatermark } from "../shared-components";
import { TopicIcon } from "./topic-icon";
import type { StorySubject, StoryTemplateProps } from "./types";

const FALLBACK_COLOR = "#9CA3AF";

function SubjectSticker({ subject, tilt }: { subject: StorySubject; tilt: number }) {
    const color = subject.topic?.colorHex || FALLBACK_COLOR;
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                width: 880,
                padding: "16px 22px",
                background: color,
                borderRadius: 16,
                borderColor: "#000000",
                borderStyle: "solid",
                borderWidth: 2,
                marginBottom: 14,
                transform: `rotate(${tilt}deg)`,
                boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
            }}
        >
            {/* Icon circle on a translucent-white disc for contrast against the sticker color. */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: "rgba(255,255,255,0.22)",
                    marginRight: 18,
                    flexShrink: 0,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color="#FFFFFF" size={28} />
            </div>
            {/* flex: 1 + minWidth: 0 lets long subject names wrap inside the 880px sticker. */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: "flex",
                        fontSize: 28,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        lineHeight: 1.2,
                        wordBreak: "break-word",
                    }}
                >
                    {subject.name}
                </span>
            </div>
        </div>
    );
}

export function renderColorfulStory(props: StoryTemplateProps) {
    const remaining = Math.max(0, props.totalSubjectsCount - props.subjects.length);
    const day = props.meetingDate.getDate();
    const monthShort = format(props.meetingDate, "MMM", { locale: el });
    const year = props.meetingDate.getFullYear();
    const tiltFor = (i: number): number => (i % 2 === 0 ? -1.2 : 1.2);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: "#ffbd9c",
                padding: "56px 48px",
                position: "relative",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 120 }}>
                {props.cityLogoImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={props.cityLogoImage}
                        height={130}
                        alt=""
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937" }}>
                        {props.cityName}
                    </span>
                    {props.adminBodyName && (
                        <span style={{ display: "flex", fontSize: 28, color: "#1f2937e4", marginTop: 4 }}>
                            {props.adminBodyName}
                        </span>
                    )}
                </div>
            </div>

            {/* "Συνεδρίαση" sticker + date pill */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 52 }}>
                <div
                    style={{
                        display: "flex",
                        background: "#1A1A1A",
                        padding: "14px 28px",
                        transform: "rotate(-2deg)",
                        // Hard-offset shadow = solid yellow block behind the sticker, 3D-stacked feel.
                        boxShadow: "10px 10px 0 0 #F4C430",
                    }}
                >
                    <span style={{ display: "flex", fontSize: 72, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
                        Συνεδρίαση
                    </span>
                </div>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#2563EB",
                        padding: "14px 24px",
                        borderRadius: 100,
                        marginLeft: 28,
                        transform: "rotate(4deg)",
                        boxShadow: "6px 6px 0 0 #1A1A1A",
                    }}
                >
                    <span style={{ display: "flex", fontSize: 40, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
                        {day} {monthShort}
                    </span>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 20,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            marginTop: 4,
                            opacity: 0.85,
                            letterSpacing: "0.1em",
                        }}
                    >
                        {year}
                    </span>
                </div>
            </div>

            {/* Total subjects pill */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    background: "#a01212",
                    borderRadius: 100,
                    padding: "10px 22px",
                    marginBottom: 56,
                    marginLeft: 52,
                    transform: "rotate(-1.5deg)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}
            >
                <span style={{ display: "flex", fontSize: 32, fontWeight: 900, color: "#FFFFFF", marginRight: 10 }}>
                    {props.totalSubjectsCount}
                </span>
                <span
                    style={{
                        display: "flex",
                        fontSize: 18,
                        color: "#FFFFFF",
                        letterSpacing: "0.22em",
                        fontWeight: 700,
                    }}
                >
                    ΘΕΜΑΤΑ ΣΥΝΟΛΙΚΑ
                </span>
            </div>

            {/* Subject stickers (top 3) */}
            {props.subjects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    {props.subjects.map((s, i) => (
                        <SubjectSticker key={s.id} subject={s} tilt={tiltFor(i)} />
                    ))}
                    {remaining > 0 && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                alignSelf: "flex-start",
                                background: "#ff6600",
                                borderRadius: 100,
                                padding: "10px 22px",
                                marginLeft: 52,
                                marginTop: 8,
                            }}
                        >
                            <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#FFFFFF" }}>
                                + {remaining} ακόμα
                            </span>
                        </div>
                    )}
                </div>
            )}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
}
