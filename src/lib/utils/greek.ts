// @ts-ignore
import { default as greekKlitiki } from "greek-name-klitiki";

export function klitiki(name: string): string {
    if (name.includes(" ")) {
        return name.split(" ").map(greekKlitiki).join(" ");
    }

    return greekKlitiki(name);
}

export function normalizeText(text: string): string {
    if (!text) return '';

    // Convert to lowercase first
    text = text.toLowerCase();

    // Remove diacritics (τόνοι)
    return text.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
        .replace(/ά/g, 'α')
        .replace(/έ/g, 'ε')
        .replace(/ή/g, 'η')
        .replace(/ί/g, 'ι')
        .replace(/ό/g, 'ο')
        .replace(/ύ/g, 'υ')
        .replace(/ώ/g, 'ω')
        .replace(/ϊ/g, 'ι')
        .replace(/ϋ/g, 'υ')
        .replace(/ΐ/g, 'ι')
        .replace(/ΰ/g, 'υ');
}
