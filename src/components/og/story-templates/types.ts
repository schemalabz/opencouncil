// Types shared by all story templates.

export type IconShape =
    | ["path", { d: string }]
    | ["circle", { cx: string; cy: string; r: string }]
    | ["rect", { width: string; height: string; x: string; y: string; rx?: string; ry?: string }]
    | ["line", { x1: string; x2: string; y1: string; y2: string }];

export interface PreviewSubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    nonAgendaReason: "beforeAgenda" | "outOfAgenda" | null;
    topic?: {
        name?: string | null;
        colorHex?: string | null;
        icon?: string | null;
    } | null;
}

export interface PreviewData {
    meetingName: string;
    meetingDate: Date;
    cityName: string;
    cityLogoImage: string | null;
    adminBodyName?: string | null;
    totalSubjects: number;
    preAgenda: PreviewSubject[];
    outOfAgenda: PreviewSubject[];
    agenda: PreviewSubject[];
    preAgendaShown: PreviewSubject[];
    agendaShown: PreviewSubject[];
    preAgendaRemaining: number;
    agendaRemaining: number;
}

export interface PillProps {
    subject: PreviewSubject;
    palette: "light" | "dark";
}
