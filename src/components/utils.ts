import { PersonWithRelations } from "@/lib/getMeetingData";

/**
 * Sorts an array of Person objects by the last word in their name (typically last name)
 */
export const sortPersonsByLastName = (persons: PersonWithRelations[]): PersonWithRelations[] => {
    return [...persons].sort((a, b) => {
        const aLastWord = a.name.split(" ").pop() || "";
        const bLastWord = b.name.split(" ").pop() || "";
        return aLastWord.localeCompare(bLastWord);
    });
};
