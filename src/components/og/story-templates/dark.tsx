// T2 — Dark: black background, white top strip, hero day-of-month, dark subject cards.

import { format } from "date-fns";
import { el } from "date-fns/locale";
import { OpenCouncilWatermark } from "../shared-components";
import { TopicIcon } from "./topic-icon";
import type { StoryTemplateProps } from "./types";

const FALLBACK_COLOR = "#9CA3AF";

export function renderDarkStory(props: StoryTemplateProps) {
    const remaining = Math.max(0, props.totalSubjectsCount - props.subjects.length);
    const month = format(props.meetingDate, "LLLL", { locale: el });
    const weekday = props.meetingDate.toLocaleDateString("el-GR", { weekday: "long" });

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                backgroundColor: "#0B0B0B",
                color: "#F5F5F5",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* White top strip with city info (bleeds full-width via negative margins) */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    marginLeft: -56,
                    marginRight: -56,
                    padding: "32px 56px",
                    marginBottom: 88,
                    backgroundColor: "#FFFFFF",
                }}
            >
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
                    {props.adminBodyName && (
                        <span
                            style={{
                                display: "flex",
                                fontSize: 32,
                                fontWeight: 600,
                                color: "#1f2937ad",
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                            }}
                        >
                            {props.adminBodyName}
                        </span>
                    )}
                    <span style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#1F2937", marginTop: 4 }}>
                        {props.cityName}
                    </span>
                </div>
            </div>

            {/* Hero day-of-month */}
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 28 }}>
                <span
                    style={{
                        display: "flex",
                        fontSize: 320,
                        fontWeight: 900,
                        color: "#FFFFFF",
                        lineHeight: 0.85,
                        letterSpacing: "-0.04em",
                    }}
                >
                    {String(props.meetingDate.getDate()).padStart(2, "0")}
                </span>
                <div style={{ display: "flex", flexDirection: "column", marginLeft: 28, marginBottom: 18 }}>
                    <span style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#FFFFFF", lineHeight: 1 }}>
                        {weekday}
                    </span>
                    <span style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#FFFFFF", lineHeight: 1 }}>
                        {month}
                    </span>
                    <span style={{ display: "flex", fontSize: 32, color: "#9CA3AF", marginTop: 8 }}>
                        {props.meetingDate.getFullYear()}
                    </span>
                </div>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", alignItems: "center", color: "#9CA3AF", fontSize: 32, marginBottom: 48 }}>
                <span style={{ display: "flex" }}>Συζητήθηκαν {props.totalSubjectsCount} θέματα</span>
            </div>

            {/* Subjects (top 3) */}
            {props.subjects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {props.subjects.map((s) => {
                        const color = s.topic?.colorHex || FALLBACK_COLOR;
                        return (
                            <div
                                key={s.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "16px 20px",
                                    background: "#1A1A1A",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 16,
                                    marginBottom: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 48,
                                        height: 48,
                                        borderRadius: 24,
                                        background: color,
                                        marginRight: 16,
                                        flexShrink: 0,
                                    }}
                                >
                                    <TopicIcon name={s.topic?.icon} color="#FFFFFF" size={28} />
                                </div>
                                {/* flex: 1 + minWidth: 0 lets long subject names wrap inside the card. */}
                                <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                                    <span
                                        style={{
                                            display: "flex",
                                            color: "#F5F5F5",
                                            fontSize: 32,
                                            fontWeight: 600,
                                            lineHeight: 1.2,
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {s.name}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    {remaining > 0 && (
                        <div style={{ display: "flex", color: "#9CA3AF", fontSize: 28, marginTop: 18 }}>
                            <span style={{ display: "flex" }}>+ {remaining} ακόμα θέματα</span>
                        </div>
                    )}
                </div>
            )}

            <OpenCouncilWatermark color="white" logoOnly size={96} bottom={48} right={48} />
        </div>
    );
}
