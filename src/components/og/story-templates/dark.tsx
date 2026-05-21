import { format } from "date-fns";
import { el } from "date-fns/locale";
import { OpenCouncilWatermark } from "../shared-components";
import type { PreviewData } from "./types";
import { SectionLabel, SubjectRow, RemainderLine, bgDarkDotsDataUri } from "./shared";
import { getSubjectSections } from "./sections";

// T2 — Dark (dark with hero date)
export const Template2Dark = (data: PreviewData) => {
    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } =
        getSubjectSections(data.subjects, { preAgenda: 2, agenda: 3 });

    const month = format(data.meetingDate, "LLLL", { locale: el });
    // Greek long-form weekday name, e.g. "Δευτέρα", "Τρίτη", ...
    const weekday = data.meetingDate.toLocaleDateString("el-GR", { weekday: "long" });

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
            {bgDarkDotsDataUri && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={bgDarkDotsDataUri}
                    alt=""
                    width={1080}
                    height={1920}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: 1080,
                        height: 1920,
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Top strip in a full-width light-tinted wrapper */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    marginLeft: -56,
                    marginRight: -56,
                    padding: "32px 56px",
                    marginBottom: 88,
                    backgroundColor: "#ffffff",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                {data.cityLogoImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 36,
                            fontWeight: 600,
                            color: "#1f2937ad",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                        }}
                    >
                        {data.adminBodyName}
                    </span>
                    <span style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#1F2937", marginTop: 4 }}>
                        {data.cityName}
                    </span>
                </div>
            </div>

            {/* Hero date */}
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
                    {String(data.meetingDate.getDate()).padStart(2, "0")}
                </span>
                <div style={{ display: "flex", flexDirection: "column", marginLeft: 28, marginBottom: 18 }}>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 60,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            lineHeight: 1,
                        }}
                    >
                        {weekday}
                    </span>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 60,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            lineHeight: 1,
                        }}
                    >
                        {month}
                    </span>
                    <span style={{ display: "flex", fontSize: 36, color: "#9CA3AF", marginTop: 8 }}>
                        {data.meetingDate.getFullYear()}
                    </span>
                </div>
            </div>

            {/* Meta strip */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    color: "#9CA3AF",
                    fontSize: 32,
                    marginBottom: 48,
                }}
            >
                <span style={{ display: "flex" }}>Συζητήθηκαν {data.subjects.length} θέματα</span>
            </div>

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={preAgenda.length} color="#9CA3AF">
                        Προ ημερησίας συζήτηση
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="dark" />
                    ))}
                </div>
            )}

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 64 }}>
                    {preAgendaRemaining > 0 && (
                        <RemainderLine count={preAgendaRemaining} color="#9CA3AF" label="ακόμα θέματα προ ημερησίας συζήτησης" />
                    )}
                </div>
            )}

            {/* Agenda section */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={agenda.length} color="#9CA3AF">
                        Ημερήσια διάταξη
                    </SectionLabel>
                    {agendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="dark" />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#9CA3AF" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoOnly color="white" size={96} bottom={48} right={48} />
        </div>
    );
};
