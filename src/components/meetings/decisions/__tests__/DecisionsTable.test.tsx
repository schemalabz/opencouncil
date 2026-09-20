import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { DecisionsTable, type TableRow, type DecisionsTableProps } from '../DecisionsTable';
import admin from '../../../../../messages/el/admin.json';
import el from '../../../../../messages/el.json';

const subject = (over: Partial<TableRow['subject']> = {}): TableRow['subject'] => ({
    id: 's1', name: 'Καθαρισμός τμημάτων', agendaItemIndex: 2, nonAgendaReason: null, withdrawn: false, ...over,
});
const row = (over: Partial<TableRow> = {}): TableRow => ({
    subject: subject(), decision: null, result: 'none', resultHint: null, voteCounts: null, proposal: null, rejected: null, ...over,
});

const props: DecisionsTableProps = {
    rows: [row()],
    beforeAgenda: [],
    filter: 'all',
    missingCount: 1,
    onFilterChange: jest.fn(),
    openPanelSubjectId: null,
    onOpenPanel: jest.fn(),
    renderPanel: () => null,
    onAcceptProposal: jest.fn(),
    onRejectProposal: jest.fn(),
    onUndoReject: jest.fn(),
    onOpenDecision: jest.fn(),
    onOpenProposalDocument: jest.fn(),
    busySubjectId: null,
};

const renderTable = (over: Partial<typeof props> = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin, Subject: el.Subject }}>
        <DecisionsTable {...props} {...over} />
    </NextIntlClientProvider>,
);

/** Roughly what three clamped lines of the Θέμα column hold. */
const THREE_LINES_HOLD = 90;
const LINE = 20;

// jsdom lays nothing out, so every clamped title measures zero against zero
// and the table would find none of them cut. Stand in for the layout with the
// one fact the real measurement reports: a title longer than three lines is
// taller than the box that shows it.
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() { return LINE * 3; },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
            return (this.textContent ?? '').length > THREE_LINES_HOLD ? LINE * 6 : LINE * 3;
        },
    });
});

describe('DecisionsTable', () => {
    it('shows an agenda number, the subject, the outcome word and the decision number', () => {
        renderTable({ rows: [row({ decision: { number: '643/2026', manualBy: null }, result: 'unanimous' })] });
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('Καθαρισμός τμημάτων')).toBeInTheDocument();
        expect(screen.getByText('Ομόφωνα')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /643\/2026/ })).toBeInTheDocument();
    });

    it('offers to fill in a number for a subject that has none', () => {
        renderTable();
        expect(screen.getByRole('button', { name: 'Συμπλήρωση αριθμού' })).toBeInTheDocument();
    });

    it('puts a found proposal on the row itself, with a yes and a no', async () => {
        const onAcceptProposal = jest.fn();
        renderTable({
            onAcceptProposal,
            rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title: 'Παροχή εντολής', likely: false } })],
        });
        expect(screen.getByText(/637\/2026/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Ναι, είναι αυτή' }));
        expect(onAcceptProposal).toHaveBeenCalledWith('s1', 'c1');
        expect(screen.getByRole('button', { name: 'Όχι' })).toBeInTheDocument();
    });

    it('centres a proposal row’s answers against its subject instead of stranding them', () => {
        // The proposal makes the Θέμα cell two lines tall. Under `items-start`
        // the Ναι/Όχι buttons stayed at the top of the cell beside it, with the
        // height of the proposal line empty under them.
        renderTable({
            rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title: 'Παροχή εντολής', likely: false } })],
        });
        const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]');
        expect(tableRow).not.toBeNull();
        const inRow = within(tableRow as HTMLElement);
        expect(inRow.getByRole('button', { name: 'Ναι, είναι αυτή' })).toBeInTheDocument();
        expect(inRow.getByRole('button', { name: 'Όχι' })).toBeInTheDocument();
        expect(inRow.getByText(/637\/2026/)).toBeInTheDocument();
        expect(tableRow).toHaveClass('items-center');
        expect(tableRow).not.toHaveClass('items-start');
    });

    it('centres an ordinary row too, whatever the height of its title', () => {
        // A real agenda title runs to eight or nine lines in this column. Under
        // `items-start` the Α/Α number, the result and the decision number all
        // sat at the title's first line instead of beside its middle.
        renderTable({ rows: [row({ decision: { number: '643/2026', manualBy: null }, result: 'unanimous' })] });
        const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]');
        expect(tableRow).toHaveClass('items-center');
        expect(tableRow).not.toHaveClass('items-start');
        // The index cell used to carry a nudge that only made sense while the
        // row was top-aligned.
        expect(within(tableRow as HTMLElement).getByText('2')).not.toHaveClass('pt-0.5');
    });

    it('hands the full decision title to a hover, since the line shortens it', () => {
        const title = 'Έγκριση παροχής εντολής και πληρεξουσιότητας σε δικηγόρο για υπόθεση συμβασιούχων';
        renderTable({ rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title, likely: false } })] });
        expect(screen.getByTitle(title)).toHaveTextContent(title);
    });

    it('marks a confident proposal and never prints the confidence', () => {
        renderTable({ rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title: null, likely: true } })] });
        expect(screen.getByText('Μάλλον ταιριάζει')).toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });

    it('takes a no back for a moment afterwards', async () => {
        const onUndoReject = jest.fn();
        renderTable({ onUndoReject, rows: [row({ rejected: { candidateId: 'c1', number: '637/2026' } })] });
        await userEvent.click(screen.getByRole('button', { name: 'Αναίρεση' }));
        expect(onUndoReject).toHaveBeenCalledWith('s1', 'c1');
    });

    it('never asks a withdrawn subject for a number', () => {
        renderTable({ rows: [row({ subject: subject({ withdrawn: true }), result: 'withdrawn' })] });
        expect(screen.getByText('Αποσύρθηκε')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Συμπλήρωση αριθμού' })).not.toBeInTheDocument();
    });

    it('names an out-of-agenda subject that was not admitted differently from a withdrawn agenda item', () => {
        renderTable({
            rows: [
                row({ subject: subject({ id: 's1', withdrawn: true }), result: 'withdrawn' }),
                row({
                    subject: subject({ id: 's2', withdrawn: true, nonAgendaReason: 'outOfAgenda', agendaItemIndex: null }),
                    result: 'withdrawn',
                }),
            ],
        });
        expect(screen.getByText('Αποσύρθηκε')).toBeInTheDocument();
        expect(screen.getByText('Δεν εγκρίθηκε')).toBeInTheDocument();
    });

    it('explains a dash that means the document records no vote', () => {
        renderTable({ rows: [row({
            decision: { number: '642/2026', manualBy: null },
            result: 'noVote',
            resultHint: 'Το έγγραφο δεν αναφέρει ψηφοφορία',
        })] });
        expect(screen.getByTitle('Το έγγραφο δεν αναφέρει ψηφοφορία')).toBeInTheDocument();
    });

    it('carries the counts beside the result word, hidden until the row is hovered at the table width', () => {
        // The word stays the cell's plain content: a clerk reading down the
        // column wants "Ομόφωνα", not a control that opens a panel over it.
        renderTable({ rows: [row({
            decision: { number: '643/2026', manualBy: null },
            result: 'majority',
            voteCounts: '8 υπέρ, 1 κατά',
        })] });
        expect(screen.getByText('Κατά πλειοψηφία').tagName).toBe('SPAN');
        expect(screen.queryByRole('button', { name: /Κατά πλειοψηφία/ })).not.toBeInTheDocument();
        const counts = screen.getByText('8 υπέρ, 1 κατά');
        expect(counts).toHaveClass('md:[@media(hover:hover)]:opacity-0', 'md:[@media(hover:hover)]:group-hover:opacity-100');
    });

    it('keeps the counts in the layout at all times, so a hover cannot move the row', () => {
        // Revealing them by mounting the span would grow the cell under the
        // pointer and shift every row below it.
        renderTable({ rows: [row({
            decision: { number: '643/2026', manualBy: null },
            result: 'unanimous',
            voteCounts: '6 υπέρ',
        })] });
        expect(screen.getByText('6 υπέρ')).toBeInTheDocument();
    });

    it('leaves the result word alone in the cell’s flow, so it centres like every other cell', () => {
        // The counts in flow made the cell two lines tall even while hidden.
        // A cell centred on two lines put the word above the row's optical
        // centre, higher than the decision number beside it.
        renderTable({ rows: [row({
            decision: { number: '643/2026', manualBy: null },
            result: 'unanimous',
            voteCounts: '6 υπέρ',
        })] });
        const word = screen.getByText('Ομόφωνα');
        const counts = screen.getByText('6 υπέρ');
        expect(counts).toHaveClass('md:[@media(hover:hover)]:absolute', 'md:[@media(hover:hover)]:top-full');
        const cellContent = word.parentElement;
        expect(cellContent).toHaveClass('relative');
        expect(counts.parentElement).toBe(cellContent);
        const inFlow = Array.from(cellContent?.children ?? [])
            .filter(child => !child.className.includes('hover:hover)]:absolute'));
        expect(inFlow).toEqual([word]);
    });

    it('keeps the counts in the row where nothing hovers, instead of over the row below', () => {
        // Always visible and out of flow, they added no height: on consecutive
        // rows the counts overlapped the next row and spilled out of the
        // Αποτέλεσμα column into the decision number beside it.
        renderTable({ rows: [row({
            decision: { number: '643/2026', manualBy: null },
            result: 'unanimous',
            voteCounts: '6 υπέρ',
        })] });
        const counts = screen.getByText('6 υπέρ');
        expect(counts).toHaveClass('block');
        expect(counts).not.toHaveClass('absolute', 'opacity-0');
    });

    it('reveals nothing for a row with no recorded vote', () => {
        // Nothing linked yet, and a linked decision whose document records no
        // vote: neither has counts, so neither grows a second line.
        renderTable({ rows: [
            row({ subject: subject({ id: 's1' }), result: 'none' }),
            row({
                subject: subject({ id: 's2' }),
                decision: { number: '642/2026', manualBy: null },
                result: 'noVote',
                resultHint: 'Το έγγραφο δεν αναφέρει ψηφοφορία',
            }),
        ] });
        expect(screen.getAllByText('—')).toHaveLength(2);
        expect(screen.queryByText(/υπέρ/)).not.toBeInTheDocument();
    });

    it('leaves a withdrawn row alone', () => {
        renderTable({ rows: [row({ subject: subject({ withdrawn: true }), result: 'withdrawn' })] });
        expect(screen.getByText('Αποσύρθηκε').tagName).toBe('SPAN');
        expect(screen.queryByText(/υπέρ/)).not.toBeInTheDocument();
    });

    it('marks a hand-added decision with who added it', () => {
        renderTable({ rows: [row({ decision: { number: '723', manualBy: 'Α. Κουλούμος' }, result: 'noVote' })] });
        expect(screen.getByTitle(/Α. Κουλούμος/)).toBeInTheDocument();
    });

    it('folds everything past twelve rows and says what is hidden', () => {
        const many = Array.from({ length: 20 }, (_, i) => row({ subject: subject({ id: `s${i}`, agendaItemIndex: i + 1 }) }));
        renderTable({ rows: many });
        expect(screen.getByRole('button', { name: 'Εμφάνιση και των 8 υπόλοιπων θεμάτων · 8 χωρίς απόφαση' })).toBeInTheDocument();
    });

    it('unfolds when the missing filter is on, so nothing outstanding hides', () => {
        const many = Array.from({ length: 20 }, (_, i) => row({ subject: subject({ id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i + 1 }) }));
        renderTable({ rows: many, filter: 'missing' });
        expect(screen.getByText('Θέμα 19')).toBeInTheDocument();
    });

    it('lists subjects taken before the agenda in one folded row that takes no decision', () => {
        renderTable({ beforeAgenda: [{ id: 'b1', name: 'Ανακοίνωση' }, { id: 'b2', name: 'Ερώτηση' }] });
        expect(screen.getByText(/Πριν από την ημερήσια διάταξη/)).toBeInTheDocument();
        expect(screen.getByText(/2 θέματα/)).toBeInTheDocument();
    });

    it('gives that line the height of a row, not a block of its own', () => {
        renderTable({ beforeAgenda: [{ id: 'b1', name: 'Ανακοίνωση' }] });
        const beforeRow = screen.getByText(/Πριν από την ημερήσια διάταξη/).closest('[role="row"]');
        expect(beforeRow).toHaveClass('min-h-[46px]', 'items-center');
    });

    it('bands a register heading across the card instead of indenting it to the Θέμα column', () => {
        renderTable({
            rows: [
                row({ subject: subject({ id: 's1', nonAgendaReason: 'outOfAgenda', agendaItemIndex: null }) }),
                row({ subject: subject({ id: 's2' }) }),
            ],
        });
        const heading = screen.getByText('Εκτός ημερήσιας διάταξης');
        expect(screen.getByText('Ημερήσιας διάταξης')).toBeInTheDocument();
        // The band is the element itself: no grid cell stands between it and
        // the card, so it opens at the card's own padding, over the Α/Α column.
        expect(heading).toHaveClass('border-t', 'px-5');
        expect(heading.closest('[role="row"]')).toBeNull();
    });

    it('opens the panel under the row it belongs to, leaving the row intact', () => {
        renderTable({ openPanelSubjectId: 's1', renderPanel: () => <div>ΤΟ ΠΛΑΙΣΙΟ</div> });
        expect(screen.getByText('ΤΟ ΠΛΑΙΣΙΟ')).toBeInTheDocument();
        expect(screen.getByText('Καθαρισμός τμημάτων')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Συμπλήρωση αριθμού' })).toBeInTheDocument();
    });

    // jsdom has no layout engine: it applies no stylesheet and measures
    // nothing, so these check which responsive classes a row carries, not
    // what the row looks like at 375px. Only a browser can confirm that.
    describe('below the table width', () => {
        it('takes the row out of the grid, where the four fixed columns do not fit', () => {
            renderTable({ rows: [row({ decision: { number: '643/2026', manualBy: null }, result: 'unanimous' })] });
            const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]') as HTMLElement;
            expect(tableRow).toHaveClass('flex', 'flex-wrap');
            expect(tableRow).toHaveClass('md:grid', 'md:grid-cols-[44px_minmax(0,1fr)_150px_210px]');
            expect(tableRow).not.toHaveClass('grid');
        });

        it('clips the column labels instead of hiding them, so a screen reader keeps them', () => {
            // Hidden, the labels left the a11y tree with the drawn header, and
            // the stacked row's values were read with nothing naming them.
            renderTable();
            const header = screen.getAllByRole('columnheader')[0].closest('[role="row"]') as HTMLElement;
            expect(header).toHaveClass('sr-only', 'md:not-sr-only', 'md:grid');
            expect(header).not.toHaveClass('hidden');
            // `md:not-sr-only` zeroes the padding, and an unprefixed utility is
            // emitted before every `md:` rule, so the padding wears `md:` too.
            expect(header).toHaveClass('md:px-5', 'md:py-2');
            expect(header).not.toHaveClass('px-5', 'py-2');
        });

        it('takes the Α/Α label out with its column, so the labels still line up', () => {
            // A cell maps to a label by position. The stacked row drops the Α/Α
            // cell, so a label that stayed would name the title cell.
            renderTable({ beforeAgenda: [{ id: 'b1', name: 'Ανακοίνωση' }] });
            const label = screen.getByText('Α/Α');
            expect(label).toHaveClass('hidden', 'md:block');
            const rows = screen.getAllByRole('row');
            for (const r of rows.slice(1)) {
                const cells = Array.from(r.querySelectorAll('[role="cell"]'));
                expect(cells[0]).toHaveClass('hidden', 'md:block');
                // The cells the stacked row keeps stay in the a11y tree, empty
                // ones included: three labels over three cells.
                expect(cells.slice(1).filter(c => c.className.includes('hidden'))).toEqual([]);
                expect(cells).toHaveLength(4);
            }
        });

        it('puts the decision number ahead of the result on the row’s second line', () => {
            renderTable({ rows: [row({ decision: { number: '643/2026', manualBy: null }, result: 'unanimous' })] });
            const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]') as HTMLElement;
            const numberCell = screen.getByRole('button', { name: /643\/2026/ }).closest('[role="cell"]') as HTMLElement;
            const resultCell = screen.getByText('Ομόφωνα').closest('[role="cell"]') as HTMLElement;
            // Document order is the grid's: result, then number. Stacked, the
            // number leads the line and grows, so the result keeps the far edge.
            expect(numberCell).toHaveClass('order-3', 'grow', 'md:order-none');
            expect(resultCell).toHaveClass('order-4', 'text-right', 'md:order-none', 'md:text-left');
            expect(Array.from(tableRow.children).indexOf(resultCell))
                .toBeLessThan(Array.from(tableRow.children).indexOf(numberCell));
        });

        it('breaks the row’s two lines apart, since a short title would not', () => {
            renderTable();
            const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]') as HTMLElement;
            const breaks = Array.from(tableRow.children).filter(c => c.className.includes('basis-full'));
            expect(breaks).toHaveLength(1);
            expect(breaks[0]).toHaveClass('md:hidden');
        });

        it('keeps the vote counts in flow and on screen, whatever the pointer is', () => {
            // Out of flow they have no column to hang under here: they landed
            // over the row below and outside the card.
            renderTable({ rows: [row({
                decision: { number: '643/2026', manualBy: null },
                result: 'unanimous',
                voteCounts: '6 υπέρ',
            })] });
            const counts = screen.getByText('6 υπέρ');
            expect(counts).toHaveClass('block');
            expect(counts.className).not.toMatch(/(^| )\[@media\(hover:hover\)\]/);
        });

        it('drops the dash from a withdrawn row, leaving it the word and no action', () => {
            renderTable({ rows: [row({ subject: subject({ withdrawn: true }), result: 'withdrawn' })] });
            expect(screen.getByText('Αποσύρθηκε')).toBeInTheDocument();
            expect(screen.getByText('—')).toHaveClass('hidden', 'md:inline');
        });

        it('leads the title with the agenda number, inside the text the clamp counts', () => {
            renderTable({
                rows: [
                    row({ subject: subject({ id: 's1' }) }),
                    row({ subject: subject({ id: 's2', nonAgendaReason: 'outOfAgenda', agendaItemIndex: null }) }),
                ],
            });
            const title = screen.getAllByTitle('Καθαρισμός τμημάτων')[0];
            const prefix = screen.getByText('2.');
            // Inside the clamped button, not beside it: beside it the prefix
            // costs a fourth line, and on a line of its own it costs one on
            // every row of a thirty-row table.
            expect(title).toContainElement(prefix);
            expect(title).toHaveClass('line-clamp-3');
            expect(prefix).toHaveClass('md:hidden');
            // The Α/Α column keeps the same number from `md` up.
            const numbered = screen.getByText('2');
            expect(numbered).toHaveClass('hidden', 'md:block');
            expect(numbered).not.toBe(prefix);
        });

        it('gives the prefix proportional figures, so the digit sits against its stop', () => {
            // `tabular-nums` gives a single digit a full figure-width advance,
            // which rendered the prefix as «1 .». The Α/Α column keeps the
            // tabular figures: there the digits do align down a column.
            renderTable();
            const prefix = screen.getByText('2.');
            expect(prefix).not.toHaveClass('tabular-nums');
            expect(screen.getByText('2')).toHaveClass('tabular-nums');
        });

        it('puts the number on the meta line and demotes «Αλλαγή» beneath it', () => {
            renderTable({ rows: [row({
                decision: { number: '506/2026', manualBy: null },
                result: 'majority',
                voteCounts: '6 υπέρ, 1 κατά',
            })] });
            const change = screen.getByRole('button', { name: 'Αλλαγή' });
            const number = screen.getByRole('button', { name: /506\/2026/ });
            // Document order is the desktop line — action, then number. The
            // column reverses below `md` so the number leads without moving.
            const stack = change.parentElement as HTMLElement;
            expect(stack).toContainElement(number);
            expect(stack).toHaveClass('flex-col-reverse', 'items-start', 'md:flex-row', 'md:items-center');
            expect(Array.from(stack.children).indexOf(change)).toBeLessThan(Array.from(stack.children).indexOf(number));
        });

        it('hands «Αλλαγή» the vote counts’ own treatment, so the two read as a pair', () => {
            renderTable({ rows: [row({
                decision: { number: '506/2026', manualBy: null },
                result: 'majority',
                voteCounts: '6 υπέρ, 1 κατά',
            })] });
            const change = screen.getByRole('button', { name: 'Αλλαγή' });
            const counts = screen.getByText('6 υπέρ, 1 κατά');
            for (const secondary of [change, counts]) {
                expect(secondary).toHaveClass('text-[11px]', 'leading-none', 'text-muted-foreground');
                // Always on screen here, whatever the pointer is: the hover
                // rule that hides it starts at the table width.
                expect(secondary.className).not.toMatch(/(^| )(opacity-0|\[@media\(hover:hover\)\])/);
                expect(secondary).toHaveClass('md:[@media(hover:hover)]:opacity-0');
            }
        });

        it('gives an out-of-agenda subject no prefix at all', () => {
            renderTable({
                rows: [row({ subject: subject({ nonAgendaReason: 'outOfAgenda', agendaItemIndex: null }) })],
            });
            const title = screen.getByTitle('Καθαρισμός τμημάτων');
            expect(title).toHaveTextContent('Καθαρισμός τμημάτων');
            expect(title.querySelector('span')).toBeNull();
        });

        it('leaves the fold button’s second line at the left edge, where a button would centre it', () => {
            const many = Array.from({ length: 20 }, (_, i) => row({ subject: subject({ id: `s${i}`, agendaItemIndex: i + 1 }) }));
            renderTable({ rows: many });
            expect(screen.getByRole('button', { name: /Εμφάνιση και των 8/ })).toHaveClass('text-left');
        });

        it('never lets a filter chip’s label wrap inside its fixed-height pill', () => {
            renderTable();
            expect(screen.getByRole('button', { name: 'Όλα' })).toHaveClass('whitespace-nowrap');
        });

        it('stacks a proposal so the mark reads with the question, not after the title', () => {
            renderTable({
                rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title: 'Παροχή εντολής', likely: true } })],
            });
            expect(screen.getByText('Βρήκαμε πιθανή απόφαση:')).toHaveClass('order-1');
            expect(screen.getByText('Μάλλον ταιριάζει')).toHaveClass('order-2');
            expect(screen.getByText('637/2026')).toHaveClass('order-4');
            expect(screen.getByText('Παροχή εντολής')).toHaveClass('order-5');
            expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου' })).toHaveClass('order-7');
        });

        it('hands the amber background the whole stacked block, not one column of it', () => {
            renderTable({
                rows: [row({ proposal: { candidateId: 'c1', number: '637/2026', title: null, likely: false } })],
            });
            const tableRow = screen.getByText('Καθαρισμός τμημάτων').closest('[role="row"]');
            expect(tableRow).toHaveClass('bg-amber-50');
        });
    });

    describe('a title too long for the column', () => {
        const long = 'Έγκριση της υπ’ αριθμόν 12/2026 μελέτης για την προμήθεια και εγκατάσταση '
            + 'εξοπλισμού παιδικών χαρών στις κοινότητες του δήμου, καθώς και της σχετικής δαπάνης';

        it('cuts it to three lines at every width', () => {
            renderTable({ rows: [row({ subject: subject({ name: long }) })] });
            expect(screen.getByTitle(long)).toHaveClass('line-clamp-3');
        });

        it('offers the click only on the title the clamp actually cuts', () => {
            renderTable({
                rows: [
                    row({ subject: subject({ id: 's1', name: long }) }),
                    row({ subject: subject({ id: 's2', name: 'Καθαρισμός τμημάτων' }) }),
                ],
            });
            const cut = screen.getByTitle(long);
            expect(cut.tagName).toBe('BUTTON');
            expect(cut).toHaveAttribute('aria-expanded', 'false');

            // A title that fits reveals nothing on a click, so it is not a
            // control: no pointer cursor, no tab stop, and a screen reader
            // reads it as the text it is.
            const fits = screen.getByTitle('Καθαρισμός τμημάτων');
            expect(fits.tagName).toBe('DIV');
            expect(fits).not.toHaveAttribute('aria-expanded');
            expect(screen.queryByRole('button', { name: /Καθαρισμός τμημάτων/ })).not.toBeInTheDocument();
        });

        it('hands the rest back on a tap, where there is no hover to hand it back', async () => {
            renderTable({ rows: [row({ subject: subject({ name: long }) })] });
            const title = screen.getByTitle(long);
            expect(title).toHaveAttribute('aria-expanded', 'false');
            expect(title).toHaveAttribute('title', long);
            await userEvent.click(title);
            expect(title).not.toHaveClass('line-clamp-3');
            expect(title).toHaveAttribute('aria-expanded', 'true');
            await userEvent.click(title);
            expect(title).toHaveClass('line-clamp-3');
        });

        it('takes the same answer from the keyboard', async () => {
            renderTable({ rows: [row({ subject: subject({ name: long }) })] });
            const title = screen.getByTitle(long);
            // A `<p>` takes no focus at all, which is the whole reason the
            // title is a button: the tap has to have a keyboard equivalent.
            title.focus();
            expect(title).toHaveFocus();
            await userEvent.keyboard('{Enter}');
            expect(title).toHaveAttribute('aria-expanded', 'true');
        });
    });

    it('exposes the grid as a table to assistive tech, with a row per header and per subject', () => {
        renderTable({
            rows: [row({ subject: subject({ id: 's1' }) }), row({ subject: subject({ id: 's2', agendaItemIndex: 3 }) })],
            beforeAgenda: [{ id: 'b1', name: 'Ανακοίνωση' }],
        });
        expect(screen.getAllByRole('columnheader')).toHaveLength(4);
        // header row + before-agenda row + 2 data rows
        expect(screen.getAllByRole('row')).toHaveLength(4);
    });
});
