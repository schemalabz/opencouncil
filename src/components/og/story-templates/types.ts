export type StoryTemplate = "classic" | "dark" | "cards" | "colorful";

export interface StorySubject {
    id: string;
    name: string;
    topic?: {
        name?: string | null;
        colorHex?: string | null;
        icon?: string | null;
    } | null;
}

export interface StoryTemplateProps {
    meetingName: string;
    meetingDate: Date;
    formattedDate: string;
    cityName: string;
    adminBodyName: string | null;
    cityLogoImage: string | null;
    subjects: StorySubject[];
    totalSubjectsCount: number;
}
