// Client-safe metadata for the 4 Story templates. Imported by both the server-rendered
// template file (`story-templates.tsx`) and the client-side picker dialog. Keep this file
// free of React / Node-only imports.

export type StoryTemplateId = "CLASSIC" | "DARK" | "CARDS" | "COLORFUL";

export const STORY_TEMPLATES: Record<StoryTemplateId, { name: string; description: string }> = {
    CLASSIC: { name: "Κλασικό", description: "Φωτεινό, καθαρό" },
    DARK: { name: "Σκούρο", description: "Σκούρο, με έμφαση στην ημερομηνία" },
    CARDS: { name: "Με κάρτες", description: "Με ανοιχτό φόντο και κάρτες με εικονίδια" },
    COLORFUL: { name: "Χρωματιστό", description: "Παιχνιδιάρικο με χρωματιστά στοιχεία" },
};

export function isValidStoryTemplate(value: unknown): value is StoryTemplateId {
    return typeof value === "string" && value in STORY_TEMPLATES;
}
