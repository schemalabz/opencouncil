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

/**
 * Extracts the first name from a full name string.
 * Works with both "Firstname Lastname" and "Lastname Firstname" formats:
 * - "Firstname Lastname" → first word ("Δημήτρης Παπαδόπουλος" → "Δημήτρης")
 * - "Lastname Firstname" → last word ("Παπαδόπουλος Δημήτρης" → "Δημήτρης")
 *
 * @param fullName - Full name in either format.
 * @param format - Which format the name is in. Defaults to "firstnameFirst".
 */
export function extractFirstName(
    fullName: string,
    format: 'firstnameFirst' | 'surnameFirst' = 'firstnameFirst',
): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    return format === 'surnameFirst' ? parts[parts.length - 1] : parts[0];
}

/**
 * Detects whether a Greek first name is female based on its ending.
 *
 * Greek first names are strongly gendered by their suffix:
 * - Female: -α, -ά, -η, -ή, -ω, -ώ, -ού (Μαρία, Ελένη, Καλλιόπη, Φωτεινή)
 * - Male: -ος, -ός, -ης, -ής, -ας, -άς, -ων, -ών, -ις, -ίς (Δημήτρης, Γεώργιος, Νικόλαος)
 *
 * Checks male endings first since -ας/-ης are supersets of -α/-η.
 *
 * @param firstName - A single Greek first name (not a full name).
 */
export function isFemaleName(firstName: string): boolean {
    // Male endings (checked first — -ας contains -α, -ης contains -η)
    if (/(?:ος|ός|ης|ής|ας|άς|ων|ών|ις|ίς)$/ui.test(firstName)) {
        return false;
    }
    // Female endings
    if (/(?:α|ά|η|ή|ω|ώ|ού)$/ui.test(firstName)) {
        return true;
    }
    return false;
}

/**
 * Returns the grammatically correct Greek word for "absent" (ΑΠΩΝ/ΑΠΟΥΣΑ)
 * based on the person's gender, inferred from their first name.
 *
 * @param firstName - A single Greek first name (not a full name).
 */
export function getAbsentLabel(firstName: string): string {
    return isFemaleName(firstName) ? 'ΑΠΟΥΣΑ' : 'ΑΠΩΝ';
}
