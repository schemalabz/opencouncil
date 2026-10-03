/**
 * A stored place's text, split for a two-line row. Google writes a place as
 * comma-separated parts from the most to the least specific, and ends with
 * the country: «Ευαγγελιστρίας 12, Φηρά 847 00, Ελλάδα». The first part names
 * the place. The parts between it and the country say where it is. The
 * country says nothing inside one municipality's signup, so it is dropped.
 */
export function splitPlaceText(text: string): { primary: string; secondary: string } {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return { primary: text.trim(), secondary: '' };
    return { primary: parts[0], secondary: parts.length > 2 ? parts.slice(1, -1).join(', ') : '' };
}
