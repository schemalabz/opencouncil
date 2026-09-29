import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, type IntlError } from 'next-intl';
import { DerivationDialog } from '../DerivationDialog';
import admin from '../../../../../messages/el/admin.json';
import enAdmin from '../../../../../messages/en/admin.json';
import frAdmin from '../../../../../messages/fr/admin.json';
import srAdmin from '../../../../../messages/sr/admin.json';
import { ISSUE_CODES } from '@/lib/derivation/types';
import { DERIVATION_STAGES, ISSUE_STAGES } from '@/lib/derivation/issueCatalogue';

/**
 * The real Greek catalogue, not a mock: the dialog's whole claim is that a code
 * cannot go missing from the explanation, and a mocked `t` would let a code
 * with no authored copy pass.
 */
const el = admin.decisionsPage;

const CATALOGS = { el: admin, en: enAdmin, fr: frAdmin, sr: srAdmin } as const;

/** The value at a dotted path of a catalog, or undefined. */
const at = (catalog: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), catalog);

const show = () =>
    render(
        <NextIntlClientProvider locale="el" messages={{ admin }}>
            <DerivationDialog open onOpenChange={() => undefined} />
        </NextIntlClientProvider>,
    );

/** The card of one step, found by the step's own name. */
const stageCard = (stage: typeof DERIVATION_STAGES[number]) => {
    const heading = screen.getByText(el.derivation.stages[stage].name);
    const card = heading.closest('section');
    if (!card) throw new Error(`no card for stage ${stage}`);
    return within(card);
};

describe('DerivationDialog', () => {
    it('explains every code the derivation can raise', () => {
        show();
        for (const code of ISSUE_CODES) {
            expect(screen.getAllByText(el.issues.codes[code]).length).toBeGreaterThan(0);
        }
    });

    it('lists a two-step code under both its steps, each pointing at the other', () => {
        show();
        expect(ISSUE_STAGES.SOURCES_DISAGREE).toEqual(['presence', 'votes']);
        const label = el.issues.codes.SOURCES_DISAGREE;
        // Step 3 sends the reader to step 4 and step 4 back to step 3.
        expect(stageCard('presence').getByText(label)).toBeInTheDocument();
        expect(stageCard('presence').getByText('και στο βήμα 4')).toBeInTheDocument();
        expect(stageCard('votes').getByText(label)).toBeInTheDocument();
        expect(stageCard('votes').getByText('και στο βήμα 3')).toBeInTheDocument();
    });

    it('lists NO_ROLL_CALL under the write step only: the write refuses the meeting before the replay runs', () => {
        show();
        expect(stageCard('write').getByText(el.issues.codes.NO_ROLL_CALL)).toBeInTheDocument();
        expect(stageCard('presence').queryByText(el.issues.codes.NO_ROLL_CALL)).not.toBeInTheDocument();
    });

    it('gives the write step no stated/derived strip — it persists, it does not read', () => {
        show();
        expect(stageCard('read').getAllByText(el.derivation.stated).length).toBe(1);
        expect(stageCard('write').queryByText(el.derivation.stated)).not.toBeInTheDocument();
        // A strip printed from a missing key renders as the dotted path itself.
        expect(screen.queryByText(/derivation\.stages\./)).not.toBeInTheDocument();
    });


    it('explains the notes the audit line shows beside the issues, in the table\'s own words', () => {
        show();
        const section = screen.getByRole('region', { name: el.derivation.lineKinds.title });
        const items = within(section).getAllByRole('listitem');
        expect(items).toHaveLength(4);
        // Each note is named as the line prints it, so a reader can match the two.
        expect(items[0]).toHaveTextContent(el.audit.moreIssues.replace('{n}', 'X'));
        expect(items[1]).toHaveTextContent(el.audit.inferredVotes);
        expect(items[2]).toHaveTextContent(el.audit.namedInDocument);
    });

    // The dialog asks for `derivation.why.<stage>.<code>` for every pair
    // `ISSUE_STAGES` names. The translation-key test checks only the stage level
    // of that group, so a code missing under one stage passed it and rendered
    // as its dotted path.
    it.each(Object.keys(CATALOGS))('has a why-text in %s for every stage and code ISSUE_STAGES names', (locale) => {
        const catalog = CATALOGS[locale as keyof typeof CATALOGS];
        const missing = ISSUE_CODES.flatMap(code => ISSUE_STAGES[code].map(stage => `derivation.why.${stage}.${code}`))
            .filter(key => typeof at(catalog.decisionsPage, key) !== 'string');
        expect(missing).toEqual([]);
    });

    it.each(Object.keys(CATALOGS))('renders in %s with no missing message and no raw key', (locale) => {
        const errors: string[] = [];
        render(
            <NextIntlClientProvider locale={locale} messages={{ admin: CATALOGS[locale as keyof typeof CATALOGS] }}
                onError={(error: IntlError) => errors.push(error.message)}>
                <DerivationDialog open onOpenChange={() => undefined} />
            </NextIntlClientProvider>,
        );
        expect(errors).toEqual([]);
        // next-intl renders a missing message as its path.
        expect(screen.queryByText(/decisionsPage\.|derivation\.(why|stages)\./)).not.toBeInTheDocument();
    });
});
