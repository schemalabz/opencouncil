/**
 * Reorders a name from "Firstname Lastname" to "Lastname Firstname".
 * For names with more than two parts (e.g., "Firstname Middle Lastname"),
 * moves only the last word to the front.
 */
export function formatSurnameFirst(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    const surname = parts[parts.length - 1];
    const rest = parts.slice(0, -1).join(' ');
    return `${surname} ${rest}`;
}
