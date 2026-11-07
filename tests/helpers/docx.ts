import { strFromU8, unzipSync } from 'fflate';

type PackedDocx = Blob | Uint8Array;

/**
 * The XML parts of a packed .docx, by their path inside the zip
 * ("word/document.xml", "word/header1.xml", ...).
 */
export async function docxParts(docx: PackedDocx): Promise<Record<string, string>> {
    // `instanceof Uint8Array` is false for a Buffer under Jest's node environment, so test for a Blob instead.
    const bytes = 'arrayBuffer' in docx ? new Uint8Array(await docx.arrayBuffer()) : docx;
    const files = unzipSync(bytes, { filter: file => file.name.endsWith('.xml') });
    return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

/** One XML part of a packed .docx, word/document.xml unless another path is given. */
export async function docxPart(docx: PackedDocx, path = 'word/document.xml'): Promise<string> {
    const xml = (await docxParts(docx))[path];
    if (xml === undefined) throw new Error(`${path} is not in the docx`);
    return xml;
}
