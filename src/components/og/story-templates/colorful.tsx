import type React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import { OpenCouncilWatermark } from "../shared-components";
import type { PreviewSubject, PreviewData } from "./types";
import { PRIMARY_PILL_FALLBACK, TopicIcon } from "./shared";

// One subject rendered as a tilted, full-color sticker with letter circle, number, and name.
const SubjectSticker = ({
    subject,
    tilt,
}: {
    subject: PreviewSubject;
    tilt: number;
}) => {
    const color = subject.topic?.colorHex || PRIMARY_PILL_FALLBACK;
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
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                {subject.agendaItemIndex && (
                    <span
                        style={{
                            display: "flex",
                            fontSize: 28,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.72)",
                            letterSpacing: "0.18em",
                        }}
                    >
                        #{String(subject.agendaItemIndex ?? 0).padStart(2, "0")}
                    </span>
                )}
                <span
                    style={{
                        display: "flex",
                        fontSize: 32,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        lineHeight: 1.2,
                        marginTop: 2,
                        wordBreak: "break-word",
                    }}
                >
                    {subject.name}
                </span>
            </div>
        </div>
    );
};

// Tilted dark label used for section headings. Sharp corners + hard-offset gray block
// behind it, mirroring the 3D look of the "Συνεδρίαση" sticker.
const StickerSectionLabel = ({
    children,
    background = "#1A1A1A",
    tilt = -1,
}: {
    children: React.ReactNode;
    background?: string;
    tilt?: number;
}) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            alignSelf: "center",
            background,
            padding: "12px 22px",
            marginBottom: 24,
            transform: `rotate(${tilt}deg)`,
            boxShadow: "8px 8px 0 0 #6B7280",
        }}
    >
        <span
            style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
            }}
        >
            {children}
        </span>
    </div>
);

// T4 — Colorful (tilted stickers on a peach pad)
export const Template4Colorful = (data: PreviewData) => {
    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } = data;

    // Short Greek date for the date pill (e.g. "14 Ιαν" / "2026").
    const day = data.meetingDate.getDate();
    const monthShort = format(data.meetingDate, "MMM", { locale: el });
    const year = data.meetingDate.getFullYear();

    // Alternate tilt direction across stickers for the collage feel.
    const stickerTilt = (i: number): number => (i % 2 === 0 ? -1.2 : 1.2);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                // Background dots layered over the peach via CSS so in-flow content
                // paints on top (see comment in dark.tsx for the painting-order rationale).
                backgroundColor: "#ffbd9c",
                backgroundImage: "url(/og/bg-peach-dots.png)",
                backgroundSize: "1080px 1920px",
                backgroundRepeat: "no-repeat",
                padding: "56px 48px",
                position: "relative",
            }}
        >
            {/* Header (mirrors Template 3) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 120 }}>
                {data.cityLogoImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            width: 110,
                            height: 110,
                            background: "#E7DDC9",
                            borderRadius: 16,
                            marginRight: 40,
                        }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 46, fontWeight: 700, color: "#1F2937" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 32, color: "#1f2937e4", marginTop: 4 }}>
                        {data.adminBodyName}
                    </span>
                </div>
            </div>

            {/* "Συνεδρίαση" title sticker + date pill */}
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
                    <span style={{ display: "flex", fontSize: 76, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
                        Συνεδρίαση
                    </span>
                </div>
                {/* Date pill */}
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
                    <span style={{ display: "flex", fontSize: 44, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
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
                <span style={{ display: "flex", fontSize: 36, fontWeight: 900, color: "#FFFFFF", marginRight: 10 }}>
                    {data.totalSubjects}
                </span>
                <span
                    style={{
                        display: "flex",
                        fontSize: 24,
                        color: "#FFFFFF",
                        letterSpacing: "0.22em",
                        fontWeight: 700,
                    }}
                >
                    ΘΕΜΑΤΑ ΣΥΝΟΛΙΚΑ
                </span>
            </div>

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <StickerSectionLabel background="#2A4A3E" tilt={-1.5}>
                        ΠΡΟ ΗΜΕΡΗΣΙΑΣ ΣΥΖΗΤΗΣΗ · {preAgenda.length}
                    </StickerSectionLabel>
                    {preAgendaShown.map((s, i) => (
                        <SubjectSticker key={s.id} subject={s} tilt={stickerTilt(i)} />
                    ))}

                </div>
            )}

            {preAgendaRemaining > 0 && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    background: "#ff6600",
                    borderRadius: 100,
                    padding: "10px 22px",
                    marginLeft: 52,
                    marginBottom: 56
                }}>
                    <span style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#FFFFFF" }}>
                        + {preAgendaRemaining} ακόμα
                    </span>
                </div>
            )}

            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <StickerSectionLabel background="#1A1A1A" tilt={-1}>
                        ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΞΗ · {agenda.length}
                    </StickerSectionLabel>
                    {agendaShown.map((s, i) => (
                        <SubjectSticker
                            key={s.id}
                            subject={s}
                            tilt={stickerTilt(i + 1)}
                        />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && (
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
                    <span style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#FFFFFF" }}>
                        + {agendaRemaining} ακόμα
                    </span>
                </div>
            )}

            <OpenCouncilWatermark logoSrc={data.blackLogoSrc} logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};
