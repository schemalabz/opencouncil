import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { MeetingDecisionsPage } from '../MeetingDecisionsPage';
import admin from '../../../../../messages/el/admin.json';
import el from '../../../../../messages/el.json';
import type { MinutesData } from '@/lib/minutes/types';
import { committeeWithSubstitute, councilWithAbsentPresident } from '@/lib/minutes/__tests__/rollCallFixtures';

/**
 * The page's own state, driven through the real table and the real card.
 *
 * Everything below the page is the production component; only the two module
 * boundaries the page cannot reach in jsdom are replaced — the meeting data
 * context (a Prisma-shaped payload the page only reads) and the poll server
 * actions (which open a Prisma client). The decisions route answers from a
 * small in-memory store, so a write and the refetch that follows it tell the
 * page the same story a real server would.
 */

const CITY_ID = 'chania';
const MEETING_ID = 'm-2026-07-23';

interface StoreCandidate {
    id: string;
    ada: string;
    decisionNumber: string | null;
    title: string;
    pdfUrl: string;
    subjectId: string | null;
    confidence: number | null;
    conflict: { subjectId: string; subjectName: string } | null;
    publishDate: string | null;
    meetingDate: string | null;
}

const candidate = (over: Partial<StoreCandidate> = {}): StoreCandidate => ({
    id: 'cand-1',
    ada: 'ΨΞΚ1ΩΗΔ-Α1Β',
    decisionNumber: '637/2026',
    title: 'Παροχή εντολής σε δικηγόρο',
    pdfUrl: 'https://diavgeia.gov.gr/doc/ΨΞΚ1ΩΗΔ-Α1Β',
    subjectId: 's2',
    confidence: 0.9,
    conflict: null,
    publishDate: '2026-07-24',
    meetingDate: '2026-07-23T00:00:00.000Z',
    ...over,
});

const linkedDecision = (subjectId: string, number: string) => ({
    id: `dec-${subjectId}`,
    subjectId,
    ada: `ΑΔΑ-${subjectId}`,
    decisionNumber: number,
    protocolNumber: null,
    title: `Απόφαση ${number}`,
    pdfUrl: `https://diavgeia.gov.gr/doc/ΑΔΑ-${subjectId}`,
    excerpt: null,
    references: null,
    candidateBacked: true,
    createdBy: null,
});

/** One subject's extracted attendance and votes, as the route sends them. */
interface StoreExtracted {
    subjectId: string;
    attendance: { personId: string; personName: string; status: string }[];
    votes: { personId: string; personName: string; voteType: string }[];
}

/** The decisions route's state for one test, and the calls made against it. */
interface Store {
    decisions: ReturnType<typeof linkedDecision>[];
    extractedData: StoreExtracted[];
    candidates: StoreCandidate[];
    dismissed: Set<string>;
    posts: { action: string; candidateId?: string; subjectId?: string }[];
    /** When set, every write answers with this instead of succeeding. */
    failWrite: { status: number; body: unknown } | null;
    /** What the minutes route answers; null answers 404, as when the minutes do not load. */
    minutes: MinutesData | null;
}

let store: Store;

const mockMeetingData = {
    meeting: {
        id: MEETING_ID,
        cityId: CITY_ID,
        name: 'Τακτική συνεδρίαση',
        dateTime: '2026-07-23T17:00:00.000Z',
        administrativeBodyId: null,
        administrativeBody: null,
    },
    city: { id: CITY_ID, diavgeiaUid: '50026', timezone: 'Europe/Athens' },
    people: [],
    getPerson: () => undefined,
    subjects: [
        { id: 's1', name: 'Έγκριση απολογισμού', agendaItemIndex: 1, agendaItemTitle: null, nonAgendaReason: null, withdrawn: false, description: null },
        { id: 's2', name: 'Παροχή εντολής σε δικηγόρο', agendaItemIndex: 2, agendaItemTitle: null, nonAgendaReason: null, withdrawn: false, description: null },
    ],
};

// react-markdown ships ESM only and jest's transform skips node_modules.
// The page never asserts on rendered markdown, so the text is enough.
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => <span>{children}</span>,
}));

// The page raises a toast for a failure with no place of its own, and no
// Toaster is mounted here — the call itself is what the test can read.
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => mockMeetingData,
}));

jest.mock('@/lib/tasks/pollDecisions', () => ({
    getPollingHistoryForMeeting: jest.fn(async () => ({
        totalPolls: 0,
        firstPollAt: null,
        lastPollAt: null,
        currentTier: null,
        currentTierLabel: null,
        nextPollEligible: null,
        pendingTaskId: null,
    })),
    requestPollDecisions: jest.fn(async () => undefined),
    resolveCandidateConflict: jest.fn(async () => 'noop'),
}));

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
    store = { decisions: [], extractedData: [], candidates: [], dismissed: new Set(), posts: [], failWrite: null, minutes: null };
    mockToast.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes('/minutes')) return store.minutes ? json(store.minutes) : { ok: false, status: 404, json: async () => ({}) };
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
            return json({
                decisions: store.decisions,
                extractedData: store.extractedData,
                candidates: store.candidates.filter(c => !store.dismissed.has(c.id)),
            });
        }
        const body = JSON.parse(init?.body ?? '{}') as { action: string; candidateId?: string; subjectId?: string };
        store.posts.push(body);
        if (store.failWrite) {
            const { status, body: payload } = store.failWrite;
            return { ok: false, status, json: async () => payload };
        }
        if (body.action === 'dismissCandidate' && body.candidateId) store.dismissed.add(body.candidateId);
        if (body.action === 'undismissCandidate' && body.candidateId) store.dismissed.delete(body.candidateId);
        if (body.action === 'assignCandidate' && body.candidateId && body.subjectId) {
            const picked = store.candidates.find(c => c.id === body.candidateId);
            store.candidates = store.candidates.filter(c => c.id !== body.candidateId);
            store.decisions = [...store.decisions, linkedDecision(body.subjectId, picked?.decisionNumber ?? '—')];
        }
        return json({ ok: true });
    });
    global.fetch = fetchMock;
});

afterAll(() => { global.fetch = originalFetch; });

const renderPage = async () => {
    render(
        <NextIntlClientProvider locale="el" messages={{ admin, Subject: el.Subject }}>
            <MeetingDecisionsPage isSuperAdmin={false} />
        </NextIntlClientProvider>,
    );
    await screen.findByRole('table', { name: 'Πίνακας αποφάσεων' });
};

const postsOf = (action: string) => store.posts.filter(p => p.action === action);

describe('MeetingDecisionsPage — rejecting a proposal and taking it back from the receipt', () => {
    it('drops the receipt on the first undo and sends no second undismiss', async () => {
        store.candidates = [candidate()];
        await renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Όχι' }));

        const receiptUndo = await screen.findByRole('button', {
            name: 'Αναίρεση: Η πρόταση για την απόφαση 637/2026 απορρίφθηκε.',
        });
        expect(postsOf('dismissCandidate')).toHaveLength(1);

        await userEvent.click(receiptUndo);

        // The receipt has to go: the card never drops one on its own, so a
        // receipt left on screen keeps offering an undo the server would
        // reject as "Candidate is not dismissed".
        await waitFor(() => expect(screen.queryByText(/Η πρόταση για την απόφαση 637\/2026 απορρίφθηκε/)).not.toBeInTheDocument());
        expect(postsOf('undismissCandidate')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: /^Αναίρεση: / })).not.toBeInTheDocument();

        // The proposal is back on its row, which is what an undo means here.
        expect(await screen.findByRole('button', { name: 'Ναι, είναι αυτή' })).toBeInTheDocument();
        expect(store.posts).toHaveLength(2);
    });
});

describe('MeetingDecisionsPage — the missing filter when the last missing row is filled', () => {
    it('returns to the full table instead of an empty one', async () => {
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.candidates = [candidate()];
        await renderPage();

        await userEvent.click(await screen.findByRole('button', { name: /Χωρίς απόφαση/ }));
        expect(screen.queryByText('Έγκριση απολογισμού')).not.toBeInTheDocument();

        await userEvent.click(await screen.findByRole('button', { name: 'Ναι, είναι αυτή' }));

        // With nothing missing the table hides its chips, so a filter left on
        // 'missing' would render the whole Πίνακας as "nothing matches" with
        // no control to get back.
        await waitFor(() => expect(screen.getByText('Έγκριση απολογισμού')).toBeInTheDocument());
        expect(screen.queryByText('Κανένα θέμα δεν ταιριάζει σε αυτό το φίλτρο.')).not.toBeInTheDocument();
        expect(screen.getByText('Παροχή εντολής σε δικηγόρο')).toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — a write the server refuses', () => {
    it('names the subject that holds the ΑΔΑ, and sends the same write again on retry', async () => {
        store.candidates = [candidate({ subjectId: null, confidence: null })];
        store.failWrite = {
            status: 409,
            body: {
                error: 'This decision is already linked to another subject',
                code: 'adaLinkedElsewhere',
                subjectId: 's2',
            },
        };
        await renderPage();

        await userEvent.click((await screen.findAllByRole('button', { name: 'Συμπλήρωση αριθμού' }))[0]);
        await userEvent.click(await screen.findByRole('button', { name: /^Σύνδεση της απόφασης 637\/2026 με το θέμα 1$/ }));

        // Without the cause the clerk retries forever: the panel's own sentence
        // says only that nothing was saved.
        expect(await screen.findByText(/ήδη συνδεδεμένη με το θέμα 2/)).toBeInTheDocument();
        expect(screen.queryByText(/already linked/)).not.toBeInTheDocument();
        expect(postsOf('assignCandidate')).toHaveLength(1);

        await userEvent.click(screen.getByRole('button', { name: 'Δοκιμή ξανά' }));

        await waitFor(() => expect(postsOf('assignCandidate')).toHaveLength(2));
    });

    it('keeps an unrecognised server sentence out of the toast', async () => {
        store.candidates = [candidate()];
        store.failWrite = { status: 500, body: { error: 'Prisma connection pool timeout' } };
        await renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Ναι, είναι αυτή' }));

        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Η αλλαγή δεν αποθηκεύτηκε',
            description: 'Δοκιμάστε ξανά σε λίγο.',
        })));
    });
});

describe('MeetingDecisionsPage — receipts on a long session', () => {
    it('keeps the last few and lets the older ones go', async () => {
        const numbers = ['601/2026', '602/2026', '603/2026', '604/2026', '605/2026'];
        store.candidates = numbers.map((decisionNumber, i) => candidate({
            id: `cand-${i}`,
            ada: `ΑΔΑ-${i}`,
            decisionNumber,
            subjectId: null,
            confidence: null,
        }));
        await renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Εμφάνιση' }));
        for (const number of numbers) {
            await userEvent.click(await screen.findByRole('button', {
                name: `Η απόφαση ${number} δεν αφορά τη συνεδρίαση`,
            }));
        }

        // Unbounded, these green lines push the Πίνακας off the screen for the
        // rest of the session, and nothing dismisses them.
        await waitFor(() => expect(screen.getAllByRole('button', { name: /^Αναίρεση: / })).toHaveLength(4));
        expect(screen.queryByRole('button', {
            name: 'Αναίρεση: Η απόφαση 601/2026 δεν αφορά τη συνεδρίαση.',
        })).not.toBeInTheDocument();
        expect(screen.getByRole('button', {
            name: 'Αναίρεση: Η απόφαση 605/2026 δεν αφορά τη συνεδρίαση.',
        })).toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — the vote behind the Αποτέλεσμα word', () => {
    it('puts the counts on the row itself, beside the word they belong to', async () => {
        // The word used to be a button that opened the side panel. The counts
        // are a companion to it now, and the panel stays for the document.
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [],
            votes: [
                { personId: 'p1', personName: 'Α. Παπαδόπουλος', voteType: 'FOR' },
                { personId: 'p2', personName: 'Β. Γεωργίου', voteType: 'FOR' },
                { personId: 'p3', personName: 'Γ. Νικολάου', voteType: 'AGAINST' },
            ],
        }];
        await renderPage();

        expect(await screen.findByText('Κατά πλειοψηφία')).toBeInTheDocument();
        expect(screen.getByText('2 υπέρ, 1 κατά')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('reveals nothing when the document records no vote', async () => {
        store.decisions = [linkedDecision('s1', '640/2026')];
        await renderPage();

        expect(await screen.findByTitle('Το έγγραφο δεν αναφέρει ψηφοφορία')).toBeInTheDocument();
        expect(screen.queryByText(/υπέρ/)).not.toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — a decision set aside', () => {
    it('keeps the receipt’s decision inspectable, and still takes the answer back', async () => {
        store.candidates = [candidate({ subjectId: null, confidence: null })];
        await renderPage();

        await userEvent.click(await screen.findByRole('button', { name: 'Εμφάνιση' }));
        await userEvent.click(await screen.findByRole('button', {
            name: 'Η απόφαση 637/2026 δεν αφορά τη συνεδρίαση',
        }));

        // The route stops sending a dismissed candidate, so without the page
        // holding on to it the identifier on the receipt had nothing to open.
        await userEvent.click(await screen.findByRole('button', { name: 'Άνοιγμα της απόφασης 637/2026' }));
        const sheet = await screen.findByRole('dialog');
        expect(within(sheet).getByText(/Παροχή εντολής σε δικηγόρο/)).toBeInTheDocument();

        await userEvent.click(within(sheet).getByRole('button', { name: 'Κλείσιμο' }));
        await userEvent.click(screen.getByRole('button', {
            name: 'Αναίρεση: Η απόφαση 637/2026 δεν αφορά τη συνεδρίαση.',
        }));

        await waitFor(() => expect(postsOf('undismissCandidate')).toHaveLength(1));
        expect(screen.queryByRole('button', { name: /^Αναίρεση: / })).not.toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — where the decisions come from', () => {
    it('names the organization id in the card footer, for a city admin too', async () => {
        // The ids used to sit inside the superadmin-only rail block, which is
        // where a city admin cannot read them. A named link then replaced them
        // with prose, which hid them from everyone. They now continue the
        // last-check sentence, each id still its own link.
        await renderPage();
        const link = screen.getByRole('link', { name: 'στον οργανισμό 50026' });
        expect(link).toHaveAttribute('href', expect.stringContaining('50026'));
        expect(screen.getByText(/Δεν έχει ελεγχθεί ακόμη/)).toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — who was present, as the minutes print it', () => {
    /** The text of the line a label opens, inside `scope`. */
    const lineIn = (scope: HTMLElement, label: string) => within(scope).getByText(label).parentElement!.textContent;
    const rail = async () => (await screen.findByText('Παρουσίες')).parentElement!;

    it('names the mayor only on the president\'s line of a committee the mayor presides', async () => {
        store.minutes = committeeWithSubstitute();
        await renderPage();

        const card = await rail();
        expect(lineIn(card, 'Πρόεδρος:')).toBe('Πρόεδρος: Μαλτέζος Ιωάννης (Δήμαρχος)');
        expect(within(card).queryByText('Δήμαρχος:')).not.toBeInTheDocument();
        expect(within(card).getByText('4 παρόντα μέλη')).toBeInTheDocument();
        expect(lineIn(card, 'Αναπληρωματικά μέλη (1):')).toBe('Αναπληρωματικά μέλη (1): Δημάκης Γιώργος');
    });

    it('keeps a council\'s mayor on a line of their own', async () => {
        store.minutes = councilWithAbsentPresident();
        await renderPage();

        const card = await rail();
        expect(lineIn(card, 'Δήμαρχος:')).toBe('Δήμαρχος: Ρούσσος Σίμος (αποχώρησε από το 4ο θέμα)');
        expect(lineIn(card, 'Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απών/απούσα');
    });

    it('counts a subject as the card counts the roll call, and both agree with the tally', async () => {
        // One regular member absent, one substitute in their place: the mayor
        // who presides is a member, so the card, the subject and the tally all
        // count the mayor, the two members and the substitute.
        store.minutes = committeeWithSubstitute();
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [
                { personId: 'mayor', personName: 'Ιωάννης Μαλτέζος', status: 'PRESENT' },
                { personId: 'm1', personName: 'Χρήστος Πετσέλης', status: 'PRESENT' },
                { personId: 'm2', personName: 'Αντώνης Λιόλιος', status: 'PRESENT' },
                { personId: 'm3', personName: 'Φώτιος Κολεβέντης', status: 'ABSENT' },
                { personId: 's1', personName: 'Γιώργος Δημάκης', status: 'PRESENT' },
            ],
            votes: ['mayor', 'm1', 'm2', 's1'].map(personId => ({ personId, personName: personId, voteType: 'FOR' })),
        }];
        await renderPage();

        expect(within(await rail()).getByText('4 παρόντα μέλη')).toBeInTheDocument();

        await userEvent.click(await screen.findByRole('button', { name: '640/2026' }));
        const sheet = await screen.findByRole('dialog');
        await userEvent.click(within(sheet).getByRole('button', { name: 'Στοιχεία απόφασης' }));

        expect(lineIn(sheet, 'Πρόεδρος:')).toBe('Πρόεδρος: Μαλτέζος Ιωάννης (Δήμαρχος)');
        expect(within(sheet).getByText('4 παρόντες, 1 απόντες')).toBeInTheDocument();
        expect(within(sheet).getByText(/4 υπέρ/)).toBeInTheDocument();
    });

    /** Opens the decision sheet of subject s1 and its facts section. */
    const openSubjectSheet = async (number: string) => {
        await userEvent.click(await screen.findByRole('button', { name: number }));
        const sheet = await screen.findByRole('dialog');
        await userEvent.click(within(sheet).getByRole('button', { name: 'Στοιχεία απόφασης' }));
        return sheet;
    };

    it('prints no mayor line on a council subject: the minutes print none per subject', async () => {
        // The council's rows never hold the mayor, who is not a member.
        store.minutes = councilWithAbsentPresident();
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [
                { personId: 'p1', personName: 'Τάνια Καραγιάννη', status: 'ABSENT' },
                { personId: 'p2', personName: 'Παναγιώτης Λαμπρόπουλος', status: 'PRESENT' },
                { personId: 'p3', personName: 'Νίκη Παπαγιαννάκη', status: 'PRESENT' },
            ],
            votes: ['p2', 'p3'].map(personId => ({ personId, personName: personId, voteType: 'FOR' })),
        }];
        await renderPage();

        expect(lineIn(await rail(), 'Δήμαρχος:')).toBe('Δήμαρχος: Ρούσσος Σίμος (αποχώρησε από το 4ο θέμα)');

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).queryByText('Δήμαρχος:')).not.toBeInTheDocument();
        expect(within(sheet).queryByText(/Ρούσσος/)).not.toBeInTheDocument();
        expect(lineIn(sheet, 'Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απών/απούσα');
    });

    it('counts 9 of 9 on a committee the mayor presides, as the Argos tally does', async () => {
        // Argos, 21 July 2026: the mayor presides, eight members and one
        // substitute sit, one member is absent, and nine vote in favour.
        const data = committeeWithSubstitute();
        const others = ['Α', 'Β', 'Γ', 'Δ', 'Ε'].map((letter, i) => ({
            personId: `m${i + 4}`, name: `Μέλος ${letter}`, party: 'Νέα Πνοή', isPartyHead: false, role: null,
        }));
        data.councilComposition!.members.push(...others);
        store.minutes = data;
        const present = ['mayor', 'm1', 'm2', ...others.map(m => m.personId), 's1'];
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [
                ...present.map(personId => ({ personId, personName: personId, status: 'PRESENT' })),
                { personId: 'm3', personName: 'Φώτιος Κολεβέντης', status: 'ABSENT' },
            ],
            votes: present.map(personId => ({ personId, personName: personId, voteType: 'FOR' })),
        }];
        await renderPage();

        expect(within(await rail()).getByText('9 παρόντα μέλη')).toBeInTheDocument();

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).getByText('9 παρόντες, 1 απόντες')).toBeInTheDocument();
        expect(within(sheet).getByText(/9 υπέρ/)).toBeInTheDocument();
    });
});
