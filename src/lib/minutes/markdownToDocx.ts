import { Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';

type DocxElement = Paragraph | Table;

/**
 * Simple markdown-to-docx converter for structured legal text.
 * Handles: paragraphs, bold (**text**), bullet lists (- item), numbered lists (1. item),
 * tables (| col | col |).
 * Does not need a full parser — decision excerpts and references are structured content.
 */
export function markdownToDocxParagraphs(
    markdown: string,
    options: { fontSize?: number } = {},
): DocxElement[] {
    const { fontSize = 22 } = options;
    const lines = markdown.split('\n');
    const elements: DocxElement[] = [];
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();

        // Skip empty lines
        if (trimmed === '') {
            i++;
            continue;
        }

        // Table: sequence of lines starting with |
        if (trimmed.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim());
                i++;
            }
            elements.push(buildDocxTable(tableLines, fontSize));
            continue;
        }

        // Bullet list item
        const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
            elements.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { before: 40, after: 40 },
                children: parseInlineFormatting(bulletMatch[1], fontSize),
            }));
            i++;
            continue;
        }

        // Numbered list item — render the full line including the number prefix.
        // We don't use docx auto-numbering because excerpts are fragments where
        // numbering wouldn't restart correctly.
        const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (numberedMatch) {
            elements.push(new Paragraph({
                spacing: { before: 40, after: 40 },
                children: parseInlineFormatting(trimmed, fontSize),
            }));
            i++;
            continue;
        }

        // Regular paragraph — center lines starting with "ΑΠΟΦΑΣΙΖΕΙ"
        const isCentered = /^(\*\*)?ΑΠΟΦΑΣΙΖΕΙ/i.test(trimmed);
        elements.push(new Paragraph({
            spacing: { before: 80, after: 80 },
            alignment: isCentered ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
            children: parseInlineFormatting(trimmed, fontSize),
        }));
        i++;
    }

    return elements;
}

/**
 * Parse inline bold formatting (**text**) into TextRun array.
 */
function parseInlineFormatting(text: string, fontSize: number): TextRun[] {
    const runs: TextRun[] = [];
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
            runs.push(new TextRun({
                text: part.slice(2, -2),
                bold: true,
                size: fontSize,
            }));
        } else if (part.length > 0) {
            runs.push(new TextRun({
                text: part,
                size: fontSize,
            }));
        }
    }

    return runs;
}

function parseTableCells(line: string): string[] {
    return line.split('|').slice(1, -1).map(cell => cell.trim());
}

function isTableSeparator(line: string): boolean {
    return /^\|[\s\-:|]+\|$/.test(line);
}

function buildDocxTable(tableLines: string[], fontSize: number): Table {
    // First line is header, second may be separator, rest are data
    const headerCells = parseTableCells(tableLines[0]);
    const dataStart = tableLines.length > 1 && isTableSeparator(tableLines[1]) ? 2 : 1;

    const headerRow = new TableRow({
        tableHeader: true,
        children: headerCells.map(cell => new TableCell({
            children: [new Paragraph({
                spacing: { before: 20, after: 20 },
                children: parseInlineFormatting(cell, fontSize - 2),
            })],
        })),
    });

    const dataRows = tableLines.slice(dataStart)
        .filter(line => !isTableSeparator(line))
        .map(line => {
            const cells = parseTableCells(line);
            // Pad or trim to match header column count
            const paddedCells = headerCells.map((_, idx) => cells[idx] ?? '');
            return new TableRow({
                children: paddedCells.map(cell => new TableCell({
                    children: [new Paragraph({
                        spacing: { before: 20, after: 20 },
                        children: parseInlineFormatting(cell, fontSize - 2),
                    })],
                })),
            });
        });

    // Distribute column widths evenly across ~9000 DXA (A4 usable width)
    const colCount = headerCells.length;
    const colWidth = Math.floor(9000 / colCount);
    const columnWidths = Array(colCount).fill(colWidth);

    return new Table({
        columnWidths,
        rows: [headerRow, ...dataRows],
    });
}
