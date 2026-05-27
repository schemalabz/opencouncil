import { format } from "date-fns";
import { OpenCouncilWatermark } from "../shared-components";
import { formatDate } from "@/lib/formatters/time";
import type { PreviewData } from "./types";
import { SectionLabel, SubjectRow, RemainderLine } from "./shared";

// T1 — Classic (cream / clean)
export const Template1Classic = (data: PreviewData) => {
    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } = data;
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
                background: "#F5EFE6",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 56 }}>
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
                    <span style={{ display: "flex", fontSize: 46, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 32, color: "#6B7280", marginTop: 4, whiteSpace: "nowrap" }}>
                        {data.adminBodyName}
                    </span>
                </div>
            </div>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 52 }}>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    Συνεδρίαση
                </span>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    {format(data.meetingDate, "dd.MM.yy")}
                </span>
            </div>

            {/* Meta row */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    color: "#4B5563",
                    fontSize: 44,
                    marginBottom: 56,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📅</span>
                    <span style={{ display: "flex" }}>{weekday}, {formatDate(data.meetingDate)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📋</span>
                    <span style={{ display: "flex" }}>{data.totalSubjects} θέματα</span>
                </div>
            </div>

            {/* Pre-agenda section */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={preAgenda.length} color="#6B7280">
                        Προ ημερησίας συζήτηση
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="light" />
                    ))}
                </div>
            )}

            {preAgendaRemaining > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
                    <RemainderLine count={preAgendaRemaining} color="#6B7280" label="ακόμα θέματα προ ημερησίας συζήτησης" />
                </div>
            )}

            {/* Agenda section */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={agenda.length} color="#6B7280">
                        Ημερήσια διάταξη
                    </SectionLabel>
                    {agendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="light" />
                    ))}
                </div>
            )}

            {/* Remainder */}
            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B7280" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoSrc={data.blackLogoSrc} logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};
