// Client-safe metadata for the 4 Story templates. Imported by both the server-rendered
// template file (`story-templates.tsx`) and the client-side picker dialog. Keep this file
// free of React / Node-only imports.

export type StoryTemplateNumber = 1 | 2 | 3 | 4;

export const STORY_TEMPLATES: ReadonlyArray<{
    id: StoryTemplateNumber;
    name: string;
    description: string;
}> = [
    { id: 1, name: "Κλασικό", description: "Φωτεινό, καθαρό" },
    { id: 2, name: "Editorial", description: "Σκούρο, με έμφαση στην ημερομηνία" },
    { id: 3, name: "Riso", description: "Αφίσα τυπογραφείου" },
    { id: 4, name: "Civic Board", description: "Πίνακας ελέγχου" },
];

export function isValidStoryTemplate(value: unknown): value is StoryTemplateNumber {
    return value === 1 || value === 2 || value === 3 || value === 4;
}
