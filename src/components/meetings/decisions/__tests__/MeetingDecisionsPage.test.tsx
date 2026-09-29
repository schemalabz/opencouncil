import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { MeetingDecisionsPage } from '../MeetingDecisionsPage';
import { requestPollDecisions } from '@/lib/tasks/pollDecisions';
import { readAdaLookup } from '@/lib/actions/adaLookups';
import admin from '../../../../../messages/el/admin.json';
import el from '../../../../../messages/el.json';
import type { MinutesData, MinutesMember } from '@/lib/minutes/types';
import type { DerivationOutput, Issue } from '@/lib/derivation/types';
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
    /** What the derivation says about the meeting, as the route sends it to a superadmin. */
    derivation?: DerivationOutput;
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
    getPerson: (_id: string): { name: string } | undefined => undefined,
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

/** The poll the status watch reports as running; a test sets it to play another poll. */
let mockPendingTaskId: string | null = null;

jest.mock('@/lib/tasks/pollDecisions', () => ({
    getPollingHistoryForMeeting: jest.fn(async () => ({
        totalPolls: 0,
        firstPollAt: null,
        lastPollAt: null,
        currentTier: null,
        currentTierLabel: null,
        nextPollEligible: null,
        pendingTaskId: mockPendingTaskId,
    })),
    requestPollDecisions: jest.fn(async () => ({ status: 'started', taskId: 't1' })),
    resolveCandidateConflict: jest.fn(async () => 'noop'),
}));

jest.mock('@/lib/actions/adaLookups', () => ({ readAdaLookup: jest.fn() }));

// LinkOrDrop uploads through the network; here it is a plain URL field.
jest.mock('@/components/ui/link-or-drop', () => ({
    LinkOrDrop: ({ value, onChange, id }: { value: string; onChange: (e: { target: { value: string } }) => void; id?: string }) =>
        <input id={id} value={value} onChange={e => onChange({ target: { value: e.target.value } })} />,
}));

const mockRequestPoll = requestPollDecisions as jest.MockedFunction<typeof requestPollDecisions>;
const mockReadAdaLookup = readAdaLookup as jest.MockedFunction<typeof readAdaLookup>;

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
    mockPendingTaskId = null;
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
                derivation: store.derivation,
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

describe('MeetingDecisionsPage — the declarations beside the vote', () => {
    const openSubjectSheet = async (number: string) => {
        await userEvent.click(await screen.findByRole('button', { name: number }));
        const sheet = await screen.findByRole('dialog');
        await userEvent.click(within(sheet).getByRole('button', { name: 'Στοιχεία απόφασης' }));
        return sheet;
    };
    const votesOf = (counts: Partial<Record<'FOR' | 'AGAINST' | 'PRESENT' | 'DID_NOT_VOTE', string[]>>) =>
        Object.entries(counts).flatMap(([voteType, names]) =>
            (names ?? []).map((personName, i) => ({ personId: `${voteType}-${i}`, personName, voteType })));

    it('names the ΠΑΡΩΝ member of a majority vote (Argos, 3η/2025, item 1: 16 for, 4 against, 1 ΠΑΡΩΝ)', async () => {
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [],
            votes: votesOf({
                FOR: Array.from({ length: 16 }, (_, i) => `Υπέρ ${i + 1}`),
                AGAINST: Array.from({ length: 4 }, (_, i) => `Κατά ${i + 1}`),
                PRESENT: ['Γρίβας Γρηγόρης'],
            }),
        }];
        await renderPage();

        const sheet = await openSubjectSheet('640/2026');
        // A declaration is not a vote: the outcome sentence keeps to the votes.
        expect(within(sheet).getByText('Κατά πλειοψηφία (16 υπέρ, 4 κατά)')).toBeInTheDocument();
        await userEvent.click(within(sheet).getByRole('button', { name: 'Παρών (1)' }));
        expect(within(sheet).getByText('Γρίβας Γρηγόρης')).toBeInTheDocument();
        expect(within(sheet).queryByRole('button', { name: /^Αποχή/ })).not.toBeInTheDocument();
    });

    it('names the ΠΑΡΩΝ and ΑΠΟΧΗ members of a unanimous vote', async () => {
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [],
            votes: votesOf({
                FOR: ['Α. Παπαδόπουλος', 'Β. Γεωργίου', 'Γ. Νικολάου'],
                PRESENT: ['Δ. Δημητρίου'],
                DID_NOT_VOTE: ['Ε. Ευαγγέλου', 'Ζ. Ζαχαρίου'],
            }),
        }];
        await renderPage();

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).getByText('Ομόφωνα (3 υπέρ)')).toBeInTheDocument();
        // The unanimous vote keeps its FOR list folded away, as before.
        expect(within(sheet).queryByRole('button', { name: /υπέρ\)$/ })).not.toBeInTheDocument();
        await userEvent.click(within(sheet).getByRole('button', { name: 'Παρών (1)' }));
        expect(within(sheet).getByText('Δ. Δημητρίου')).toBeInTheDocument();
        await userEvent.click(within(sheet).getByRole('button', { name: 'Αποχή (2)' }));
        expect(within(sheet).getByText('Ε. Ευαγγέλου, Ζ. Ζαχαρίου')).toBeInTheDocument();
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

/**
 * The minutes with the subject of `extracted`, whose attendance is the rows the
 * decisions route sends: both routes read the same stored rows, and the subject
 * block reads the minutes' snapshot.
 */
const withSubject = (data: MinutesData, extracted: StoreExtracted): MinutesData => {
    const member = (a: StoreExtracted['attendance'][number]): MinutesMember => ({ personId: a.personId, name: a.personName, party: null, isPartyHead: false, role: null });
    return {
        ...data,
        subjects: [{
            subjectId: extracted.subjectId, agendaItemIndex: 1, agendaSectionIndex: null, nonAgendaReason: null, withdrawn: false, name: 'Έγκριση απολογισμού',
            discussedWith: null, discussedElsewhere: null, decision: null, presidedBy: data.councilComposition?.presidedBy ?? null,
            attendance: {
                present: extracted.attendance.filter(a => a.status === 'PRESENT').map(member),
                absent: extracted.attendance.filter(a => a.status === 'ABSENT').map(member),
            },
            voteResult: null, discussion: { kind: 'none', seconds: 0, start: null }, preDiscussionEntries: [], transcriptEntries: [],
        }],
    };
};

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
        expect(lineIn(card, 'Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απούσα');
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
        store.minutes = withSubject(store.minutes, store.extractedData[0]);
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
        store.minutes = withSubject(store.minutes, store.extractedData[0]);
        await renderPage();

        expect(lineIn(await rail(), 'Δήμαρχος:')).toBe('Δήμαρχος: Ρούσσος Σίμος (αποχώρησε από το 4ο θέμα)');

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).queryByText('Δήμαρχος:')).not.toBeInTheDocument();
        expect(within(sheet).queryByText(/Ρούσσος/)).not.toBeInTheDocument();
        expect(lineIn(sheet, 'Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απούσα');
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
        store.minutes = withSubject(data, store.extractedData[0]);
        await renderPage();

        expect(within(await rail()).getByText('9 παρόντα μέλη')).toBeInTheDocument();

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).getByText('9 παρόντες, 1 απόντες')).toBeInTheDocument();
        expect(within(sheet).getByText(/9 υπέρ/)).toBeInTheDocument();
    });

    it('counts and names a member who sat in on a subject with no roll-call row, as the tally does', async () => {
        // chalandri/aug20_2026 items 7–11: Ευθυμίου has rows and a vote on the subject and no roll-call row.
        store.minutes = committeeWithSubstitute();
        store.decisions = [linkedDecision('s1', '640/2026')];
        const present = ['mayor', 'm1', 'm2', 's1', 'x'];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [
                ...present.map(personId => ({ personId, personName: personId === 'x' ? 'Ευθυμίου Κωνσταντίνος' : personId, status: 'PRESENT' })),
                { personId: 'm3', personName: 'Φώτιος Κολεβέντης', status: 'ABSENT' },
            ],
            votes: present.map(personId => ({ personId, personName: personId, voteType: 'FOR' })),
        }];
        store.minutes = withSubject(store.minutes, store.extractedData[0]);
        await renderPage();

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).getByText('5 παρόντες, 1 απόντες')).toBeInTheDocument();
        expect(within(sheet).getByText(/5 υπέρ/)).toBeInTheDocument();
        await userEvent.click(within(sheet).getByRole('button', { name: /Εμφάνιση ονομάτων \(παρόντες\)/ }));
        expect(within(sheet).getByText(/Ευθυμίου Κωνσταντίνος/)).toBeInTheDocument();
    });

    it("shows the decisions' own rows for a subject when the minutes do not load", async () => {
        store.decisions = [linkedDecision('s1', '640/2026')];
        store.extractedData = [{
            subjectId: 's1',
            attendance: [
                { personId: 'p2', personName: 'Παναγιώτης Λαμπρόπουλος', status: 'PRESENT' },
                { personId: 'p3', personName: 'Νίκη Παπαγιαννάκη', status: 'PRESENT' },
                { personId: 'p1', personName: 'Τάνια Καραγιάννη', status: 'ABSENT' },
            ],
            votes: ['p2', 'p3'].map(personId => ({ personId, personName: personId, voteType: 'FOR' })),
        }];
        await renderPage();

        const sheet = await openSubjectSheet('640/2026');
        expect(within(sheet).getByText('2 παρόντες, 1 απόντες')).toBeInTheDocument();
        expect(within(sheet).queryByText('Πρόεδρος:')).not.toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — the names an issue prints', () => {
    const derivation = (issues: Issue[]): DerivationOutput => ({ attendance: [], votes: [], issues, rollCall: [], events: [] });
    const original = mockMeetingData.getPerson;
    beforeEach(() => { mockMeetingData.getPerson = id => (id === 'p1' ? { name: 'Παπαδόπουλος Γιώργος' } : undefined); });
    afterEach(() => { mockMeetingData.getPerson = original; });

    const renderAsSuperAdmin = async () => {
        render(
            <NextIntlClientProvider locale="el" messages={{ admin, Subject: el.Subject }}>
                <MeetingDecisionsPage isSuperAdmin />
            </NextIntlClientProvider>,
        );
        await screen.findByRole('table', { name: 'Πίνακας αποφάσεων' });
    };

    it('names the presiding members from the city\'s people, never by id', async () => {
        store.derivation = derivation([{ code: 'PRESIDING_DISAGREES', source: 'decision',
            params: { presiding: [{ personId: 'p1', name: 'Γ. Παπαδόπουλος' }, { personId: null, name: 'Κ. Δήμου' }] } }]);
        await renderAsSuperAdmin();
        const label = admin.decisionsPage.issues.codes.PRESIDING_DISAGREES;
        const button = screen.queryByRole('button', { name: new RegExp(label) });
        if (button) await userEvent.click(button);
        expect(await screen.findByText(/Παπαδόπουλος Γιώργος, Κ\. Δήμου/)).toBeInTheDocument();
        expect(screen.queryByText(/\bp1\b/)).not.toBeInTheDocument();
    });

    it('names a subject that left the order by its agenda number and title, not by id', async () => {
        store.derivation = derivation([{ code: 'UNPLACEABLE_ANCHOR', source: 'manual', personId: 'p1',
            params: { kind: 'ARRIVAL', reason: 'noSuchSubject', detail: 's2' } }]);
        await renderAsSuperAdmin();
        const label = admin.decisionsPage.issues.codes.UNPLACEABLE_ANCHOR;
        const button = screen.queryByRole('button', { name: new RegExp(label) });
        if (button) await userEvent.click(button);
        expect(await screen.findByText(/«2\. Παροχή εντολής σε δικηγόρο»/)).toBeInTheDocument();
        expect(screen.queryByText(/«s2»/)).not.toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — from the issues card to the subject', () => {
    const renderAsSuperAdmin = async () => {
        render(
            <NextIntlClientProvider locale="el" messages={{ admin, Subject: el.Subject }}>
                <MeetingDecisionsPage isSuperAdmin />
            </NextIntlClientProvider>,
        );
        await screen.findByRole('table', { name: 'Πίνακας αποφάσεων' });
    };
    afterEach(() => window.localStorage.clear());

    it('opens the subject\'s issues under its row, turning audit mode on, and states each issue once', async () => {
        store.derivation = { attendance: [], votes: [], rollCall: [], events: [], issues: [
            { code: 'CONVENTIONS_UNCONFIRMED', source: null, params: {} },
            { code: 'UNMATCHED_NAME', subjectId: 's2', decisionId: 'd2', source: 'decision', rawText: 'Κ. Δήμου', params: { name: 'Κ. Δήμου' } },
            { code: 'UNMATCHED_NAME', subjectId: 's2', decisionId: 'd2', source: 'decision', rawText: 'Λ. Λάμπρου', params: { name: 'Λ. Λάμπρου' } },
        ] };
        await renderAsSuperAdmin();
        const card = screen.getByRole('region', { name: admin.decisionsPage.issues.subjectsTitle });
        expect(screen.queryByRole('region', { name: '2 ζητήματα σε αυτό το θέμα' })).not.toBeInTheDocument();
        await userEvent.click(within(card).getByRole('button', { name: new RegExp(admin.decisionsPage.issues.codes.UNMATCHED_NAME) }));
        const region = await screen.findByRole('region', { name: '2 ζητήματα σε αυτό το θέμα' });
        expect(within(region).getByText(/«Κ\. Δήμου»/)).toBeInTheDocument();
        expect(screen.getAllByText(/«Κ\. Δήμου» δεν αντιστοιχίστηκε/)).toHaveLength(1);
        // The meeting-wide issue is stated in the card, in full, and not in the table.
        expect(screen.getAllByText(admin.decisionsPage.issues.messages.CONVENTIONS_UNCONFIRMED)).toHaveLength(1);
        expect(within(region).queryByText(admin.decisionsPage.issues.messages.CONVENTIONS_UNCONFIRMED)).not.toBeInTheDocument();
    });
});

describe('MeetingDecisionsPage — looking up a typed ΑΔΑ', () => {
    const ADA = '9ΩΡΤΩΞ1-0ΥΣ';

    beforeEach(() => {
        mockRequestPoll.mockReset();
        mockRequestPoll.mockResolvedValue({ status: 'started', taskId: 't1' });
        mockReadAdaLookup.mockReset();
        mockReadAdaLookup.mockResolvedValue({ state: 'running' });
    });

    afterAll(() => {
        mockRequestPoll.mockReset();
        mockRequestPoll.mockResolvedValue({ status: 'started', taskId: 't1' });
    });

    type User = Pick<ReturnType<typeof userEvent.setup>, 'click' | 'type'>;
    const NOT_FOUND = /δεν έχει δημοσιευμένη απόφαση με ΑΔΑ 9ΩΡΤΩΞ1-0ΥΣ/;
    const SEARCH_FAILED = 'Η αναζήτηση για τον ΑΔΑ 9ΩΡΤΩΞ1-0ΥΣ δεν ολοκληρώθηκε. Δοκιμάστε ξανά.';

    /** No candidate exists, so the panel opens straight on the ΑΔΑ step. */
    const searchFromTheFirstRow = async (user: User = userEvent) => {
        await renderPage();
        await user.click((await screen.findAllByRole('button', { name: 'Συμπλήρωση αριθμού' }))[0]);
        await user.type(screen.getByLabelText('ΑΔΑ'), ADA);
        await user.click(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' }));
    };

    /** The ten-second waits below run on jest's clock. */
    const withFakeTimers = async (run: (user: User) => Promise<void>) => {
        jest.useFakeTimers();
        try {
            await run(userEvent.setup({ advanceTimers: jest.advanceTimersByTime }));
        } finally {
            jest.useRealTimers();
        }
    };

    it('opens the ΑΔΑ step for an empty row and starts a poll that looks the ΑΔΑ up', async () => {
        await searchFromTheFirstRow();
        expect(mockRequestPoll).toHaveBeenCalledWith(CITY_ID, MEETING_ID, { lookupAdas: [ADA] });
        expect(await screen.findByText(/Αναζήτηση στη Διαύγεια…/)).toBeInTheDocument();
        expect(screen.getByText('Δεν υπάρχει απόφαση της Διαύγειας για αυτή τη συνεδρίαση χωρίς θέμα.')).toBeInTheDocument();
    });

    it('closes the panel from the ΑΔΑ step while the search runs', async () => {
        await searchFromTheFirstRow();
        expect(await screen.findByText(/Αναζήτηση στη Διαύγεια…/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Κλείσιμο' }));
        expect(screen.queryByLabelText('ΑΔΑ')).not.toBeInTheDocument();
    });

    it('says nothing was found once the poll ends', async () => {
        mockReadAdaLookup.mockResolvedValue({ state: 'notFound' });
        await searchFromTheFirstRow();
        expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
        expect(mockReadAdaLookup).toHaveBeenCalledWith(CITY_ID, MEETING_ID, 't1', ADA);
        expect(screen.getByLabelText('ΑΔΑ')).toHaveValue(ADA);
    });

    it('says the found document is not a decision', async () => {
        mockReadAdaLookup.mockResolvedValue({ state: 'notADecision' });
        await searchFromTheFirstRow();
        expect(await screen.findByText(/υπάρχει στη Διαύγεια, αλλά δεν είναι απόφαση συλλογικού οργάνου/)).toBeInTheDocument();
        expect(screen.queryByText(SEARCH_FAILED)).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('reads the outcome again when the status watch never sees the task', async () => {
        // The task ended before the page's first status read, so the watch
        // never reports it pending; only the step's own re-read can finish it.
        mockReadAdaLookup.mockReset();
        mockReadAdaLookup.mockResolvedValueOnce({ state: 'running' }).mockResolvedValue({ state: 'notFound' });
        await withFakeTimers(async user => {
            await searchFromTheFirstRow(user);
            await waitFor(() => expect(mockReadAdaLookup).toHaveBeenCalledTimes(1));
            expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument();
            expect(screen.getByText(/Αναζήτηση στη Διαύγεια…/)).toBeInTheDocument();

            await act(async () => { jest.advanceTimersByTime(10_000); });
            expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
            expect(mockReadAdaLookup).toHaveBeenCalledTimes(2);
        });
    });

    it('shows a poll-start failure in the step, not as a failed link', async () => {
        mockRequestPoll.mockRejectedValue(new Error('boom'));
        await searchFromTheFirstRow();
        expect(await screen.findByText(`${SEARCH_FAILED} Δοκιμάστε ξανά σε λίγο.`)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Δοκιμάστε ξανά' })).toBeEnabled();
        expect(screen.queryByText(/Η σύνδεση δεν αποθηκεύτηκε/)).not.toBeInTheDocument();
        expect(mockReadAdaLookup).not.toHaveBeenCalled();
    });

    it('says the search did not finish when its outcome cannot be read', async () => {
        mockReadAdaLookup.mockRejectedValue(new Error('boom'));
        await searchFromTheFirstRow();
        expect(await screen.findByText(SEARCH_FAILED)).toBeInTheDocument();
        expect(screen.queryByText(/Η Διαύγεια δεν απάντησε/)).not.toBeInTheDocument();
    });

    it('waits for a poll someone else started, then lets the search run', async () => {
        mockRequestPoll.mockImplementation(async () => {
            mockPendingTaskId = 't0';
            return { status: 'alreadyRunning', taskId: 't0' };
        });
        await withFakeTimers(async user => {
            await searchFromTheFirstRow(user);
            expect(await screen.findByText(/Μια αναζήτηση στη Διαύγεια τρέχει ήδη/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' })).toBeDisabled();

            mockPendingTaskId = null;
            await act(async () => { jest.advanceTimersByTime(10_000); });
            await waitFor(() => expect(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' })).toBeEnabled());
            expect(screen.queryByText(/Μια αναζήτηση στη Διαύγεια τρέχει ήδη/)).not.toBeInTheDocument();
        });
    });

    it('names the subject and the meeting that already hold a decision of another meeting', async () => {
        mockReadAdaLookup.mockResolvedValue({
            state: 'found',
            candidateId: null,
            organizationLabel: null,
            linkedTo: { subjectId: 'x5', meetingId: 'm-other', meetingName: 'Ειδική συνεδρίαση', subjectName: 'Κάτι άλλο', agendaItemIndex: 5 },
        });
        await searchFromTheFirstRow();
        expect(await screen.findByText(
            'Η απόφαση με ΑΔΑ 9ΩΡΤΩΞ1-0ΥΣ είναι ήδη συνδεδεμένη με το θέμα 5 της συνεδρίασης «Ειδική συνεδρίαση».',
        )).toBeInTheDocument();
    });

    it('opens a found document next to the row', async () => {
        // The poll filed the document on this meeting by the time it ended; the
        // refetch that follows the outcome is what the panel reads the number from.
        mockReadAdaLookup.mockImplementation(async () => {
            store.candidates = [candidate({ id: 'cand-9', ada: ADA, decisionNumber: '66/2026', subjectId: null, confidence: null })];
            return { state: 'found', candidateId: 'cand-9', organizationLabel: null, linkedTo: null };
        });
        await searchFromTheFirstRow();
        expect(await screen.findByText('Βρέθηκε η απόφαση 66/2026.')).toBeInTheDocument();
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('keeps searching while a found candidate is not in the refetch yet, then opens it', async () => {
        // The task is marked done before its result handler writes the
        // candidate, so the refetch can come back without it.
        mockReadAdaLookup.mockResolvedValue({ state: 'found', candidateId: 'cand-9', organizationLabel: null, linkedTo: null });
        await withFakeTimers(async user => {
            await searchFromTheFirstRow(user);
            await waitFor(() => expect(mockReadAdaLookup).toHaveBeenCalledTimes(1));
            await act(async () => { await Promise.resolve(); });
            expect(screen.getByText(/Αναζήτηση στη Διαύγεια…/)).toBeInTheDocument();
            expect(screen.queryByText(SEARCH_FAILED)).not.toBeInTheDocument();

            store.candidates = [candidate({ id: 'cand-9', ada: ADA, decisionNumber: '66/2026', subjectId: null, confidence: null })];
            await act(async () => { jest.advanceTimersByTime(10_000); });
            expect(await screen.findByText('Βρέθηκε η απόφαση 66/2026.')).toBeInTheDocument();
            expect(mockReadAdaLookup).toHaveBeenCalledTimes(2);
        });
    });

    it('says the search did not finish when a found candidate stays out of the refetch', async () => {
        mockReadAdaLookup.mockResolvedValue({ state: 'found', candidateId: 'cand-gone', organizationLabel: null, linkedTo: null });
        await withFakeTimers(async user => {
            await searchFromTheFirstRow(user);
            await waitFor(() => expect(mockReadAdaLookup).toHaveBeenCalledTimes(1));
            for (let i = 0; i < 13; i++) {
                await act(async () => { jest.advanceTimersByTime(10_000); });
            }
            expect(await screen.findByText(SEARCH_FAILED)).toBeInTheDocument();
        });
    });
});

describe('MeetingDecisionsPage — a decision that is not on Diavgeia', () => {
    beforeEach(() => {
        mockRequestPoll.mockReset();
        mockRequestPoll.mockResolvedValue({ status: 'started', taskId: 't1' });
    });

    const putBodies = () => fetchMock.mock.calls
        .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PUT')
        .map(([, init]) => JSON.parse((init as { body: string }).body) as Record<string, unknown>);

    const fillManualEntry = async () => {
        await renderPage();
        await userEvent.click((await screen.findAllByRole('button', { name: 'Συμπλήρωση αριθμού' }))[0]);
        await userEvent.click(screen.getByRole('button', { name: 'Χειροκίνητη προσθήκη' }));
        await userEvent.type(screen.getByLabelText('PDF απόφασης'), 'https://files.example/a.pdf');
        await userEvent.type(screen.getByLabelText('Αριθμός απόφασης'), '12/2025');
        await userEvent.click(screen.getByRole('button', { name: 'Συνέχεια' }));
    };

    it('saves the PDF and the number without an ΑΔΑ after the sheet, then starts a poll', async () => {
        await fillManualEntry();
        const sheet = await screen.findByRole('dialog');
        expect(within(sheet).getByText('Δεν είναι στη Διαύγεια')).toBeInTheDocument();
        expect(putBodies()).toHaveLength(0);
        await userEvent.click(within(sheet).getByRole('button', { name: 'Αποθήκευση' }));
        await waitFor(() => expect(mockRequestPoll).toHaveBeenCalledWith(CITY_ID, MEETING_ID));
        expect(putBodies()).toEqual([{ subjectId: 's1', pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025' }]);
        expect(await screen.findByText(/Η απόφαση 12\/2025 προστέθηκε/)).toBeInTheDocument();
    });

    it('goes back to the filled form from the sheet without saving', async () => {
        await fillManualEntry();
        const sheet = await screen.findByRole('dialog');
        await userEvent.click(within(sheet).getByRole('button', { name: 'Πίσω' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByLabelText('Αριθμός απόφασης')).toHaveValue('12/2025');
        expect(putBodies()).toHaveLength(0);
    });

    describe('over a linked decision', () => {
        const writeMethods = () => fetchMock.mock.calls
            .map(([, init]) => (init as { method?: string } | undefined)?.method ?? 'GET')
            .filter(method => method !== 'GET');

        /** «Αλλαγή» on the first row, then the manual form, filled and continued to the sheet. */
        const fillManualOverTheFirstRow = async () => {
            await renderPage();
            await userEvent.click((await screen.findAllByRole('button', { name: 'Αλλαγή' }))[0]);
            await userEvent.click(screen.getByRole('button', { name: 'Χειροκίνητη προσθήκη' }));
            await userEvent.type(screen.getByLabelText('PDF απόφασης'), 'https://files.example/a.pdf');
            await userEvent.type(screen.getByLabelText('Αριθμός απόφασης'), '12/2025');
            await userEvent.click(screen.getByRole('button', { name: 'Συνέχεια' }));
            return screen.findByRole('dialog');
        };

        it('says in the sheet what happens to the decision it replaces', async () => {
            store.decisions = [linkedDecision('s1', '640/2026')];
            const sheet = await fillManualOverTheFirstRow();
            expect(within(sheet).getByText('Η 640/2026 επιστρέφει στις αποφάσεις χωρίς θέμα.')).toBeInTheDocument();
        });

        it('warns in the sheet that a decision added by hand is deleted', async () => {
            store.decisions = [{ ...linkedDecision('s1', '640/2026'), candidateBacked: false }];
            const sheet = await fillManualOverTheFirstRow();
            expect(within(sheet).getByText(/Η 640\/2026 προστέθηκε με το χέρι: διαγράφεται οριστικά/)).toBeInTheDocument();
        });

        it('removes the current link before it saves the manual decision', async () => {
            store.decisions = [linkedDecision('s1', '640/2026')];
            const sheet = await fillManualOverTheFirstRow();
            await userEvent.click(within(sheet).getByRole('button', { name: 'Αποθήκευση' }));
            await waitFor(() => expect(mockRequestPoll).toHaveBeenCalledWith(CITY_ID, MEETING_ID));
            expect(writeMethods()).toEqual(['DELETE', 'PUT']);
            expect(fetchMock.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')?.[0])
                .toContain('subjectId=s1');
            expect(await screen.findByText(/Η απόφαση 12\/2025 προστέθηκε/)).toBeInTheDocument();
        });

        it('replaces a decision added by hand with the save alone', async () => {
            store.decisions = [{ ...linkedDecision('s1', '640/2026'), candidateBacked: false }];
            const sheet = await fillManualOverTheFirstRow();
            await userEvent.click(within(sheet).getByRole('button', { name: 'Αποθήκευση' }));
            await waitFor(() => expect(mockRequestPoll).toHaveBeenCalledWith(CITY_ID, MEETING_ID));
            expect(writeMethods()).toEqual(['PUT']);
            expect(await screen.findByText(/Η απόφαση 12\/2025 προστέθηκε/)).toBeInTheDocument();
        });

        it('keeps a decision added by hand when the save that replaces it fails', async () => {
            store.decisions = [{ ...linkedDecision('s1', '640/2026'), candidateBacked: false }];
            const serve = fetchMock.getMockImplementation();
            fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
                if (init?.method === 'PUT') return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
                return serve?.(url, init);
            });
            const sheet = await fillManualOverTheFirstRow();
            await userEvent.click(within(sheet).getByRole('button', { name: 'Αποθήκευση' }));
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            expect(writeMethods()).toEqual(['PUT']);
            expect(store.decisions).toHaveLength(1);
            expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({
                title: expect.stringContaining('αφαιρέθηκε, αλλά η νέα σύνδεση δεν αποθηκεύτηκε'),
            }));
            expect(mockRequestPoll).not.toHaveBeenCalled();
        });

        it('says the row was left empty when the save fails after the removal', async () => {
            // No candidate in the pool carries the removed ΑΔΑ, so it cannot be linked back.
            store.decisions = [linkedDecision('s1', '640/2026')];
            const serve = fetchMock.getMockImplementation();
            fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
                if (init?.method === 'PUT') return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
                if (init?.method === 'DELETE') store.decisions = [];
                return serve?.(url, init);
            });
            const sheet = await fillManualOverTheFirstRow();
            await userEvent.click(within(sheet).getByRole('button', { name: 'Αποθήκευση' }));
            await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: expect.stringContaining('Η 640/2026 αφαιρέθηκε, αλλά η νέα σύνδεση δεν αποθηκεύτηκε'),
                variant: 'destructive',
            })));
            expect(writeMethods()).toEqual(['DELETE', 'PUT']);
            expect(mockRequestPoll).not.toHaveBeenCalled();
        });
    });
});
