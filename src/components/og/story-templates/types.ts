// Types shared by all story templates.

export type IconShape =
    | ["path", { d: string }]
    | ["circle", { cx: string; cy: string; r: string }]
    | ["rect", { width: string; height: string; x: string; y: string; rx?: string; ry?: string }]
    | ["line", { x1: string; x2: string; y1: string; y2: string }];

export interface StorySubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    nonAgendaReason: "beforeAgenda" | "outOfAgenda" | null;
    topic?: {
        name?: string | null;
        colorHex?: string | null;
        icon?: string | null;
    } | null;
    /** Speaker contribution count; the route handler pre-sorts subjects by this descending
     *  via `sortSubjectsBySpeakerContributionCount`. */
    _count?: { contributions?: number };
}

export interface StoryTemplateData {
    meetingName: string;
    meetingDate: Date;
    cityName: string;
    cityLogoImage: string | null;
    adminBodyName?: string | null;
    subjects: StorySubject[];
}

export interface PillProps {
    subject: StorySubject;
    palette: "light" | "dark";
}
