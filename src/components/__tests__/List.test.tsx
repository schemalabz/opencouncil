import { fireEvent, render, screen } from '@testing-library/react';
import List from '../List';
import { useLocalCollection } from '@/components/collection/useLocalCollection';
import type { CollectionState } from '@/components/collection/types';
import { fixedCollection } from '@/components/collection/fixedCollection';

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    usePathname: () => '/chania',
    useSearchParams: () => mockSearchParams,
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

// The add-item sheet drags in forms and dialogs; the flag it renders under is
// what matters here, not its contents.
jest.mock('@/components/FormSheet', () => ({
    __esModule: true,
    default: () => <button type="button">add-sheet</button>,
}));

type Item = { id: string; name: string; roles?: { name: string }[] };

const items: Item[] = [
    { id: '1', name: 'Δημοτικό Συμβούλιο 05/08/26' },
    { id: '2', name: 'Δημοτική Επιτροπή 10/08/26' },
];

const people: Item[] = [
    { id: 'p1', name: 'Μαρία Παπαδοπούλου', roles: [{ name: 'Δήμαρχος' }] },
    { id: 'p2', name: 'Γιώργος Παπανικολάου', roles: [{ name: 'Πρόεδρος' }] },
];

const roleNames = (item: Item) => (item.roles ?? []).map(role => role.name);

const Card = ({ item }: { item: Item }) => <div data-testid="row">{item.name}</div>;

const t = (key: string, params?: { count?: number }) =>
    params?.count === undefined ? key : `${key}:${params.count}`;

type RenderProps = {
    showCount?: boolean;
    announceCount?: boolean;
    editable?: boolean;
    items?: Item[];
    searchKeys?: (item: Item) => (string | null | undefined)[];
    sortItems?: (items: Item[], selectedValues: (string | undefined)[], selectedBody: string | null) => Item[];
    filterAvailableValues?: { value: string | undefined; label: string }[];
    filter?: (selectedValues: (string | undefined)[], item: Item, selectedBody: string | null) => boolean;
    trailing?: { title: string; matches: (item: Item) => boolean };
    pending?: boolean;
};

/** A page's wiring: the local source fills the state, and List draws it. */
function LocalList({ editable = false, items: rows = items, showCount, announceCount, searchKeys, sortItems, filterAvailableValues, filter, trailing, pending }: RenderProps) {
    const state = useLocalCollection<Item, string | undefined>(rows, {
        searchKeys,
        sortItems,
        filterOptions: filterAvailableValues,
        filter,
    });
    return (
        <List<Item>
            state={pending ? { ...state, pending } : state}
            editable={editable}
            ItemComponent={Card}
            FormComponent={() => null}
            formProps={{}}
            t={t}
            showCount={showCount}
            announceCount={announceCount}
            trailing={trailing}
        />
    );
}

function renderList(props: RenderProps = {}) {
    return render(<LocalList {...props} />);
}

/** A list with no search: the subject carousel's source. */
function renderFixedList(props: { showCount?: boolean; editable?: boolean } = {}) {
    return render(
        <List<Item> state={fixedCollection(items)} editable={props.editable ?? false} ItemComponent={Card} FormComponent={() => null} formProps={{}} t={t} showCount={props.showCount} />
    );
}

// What a server source hands the view: one page of rows, with the page
// changing only when the navigation lands.
const serverState = (overrides: Partial<CollectionState<Item, string>> = {}): CollectionState<Item, string> => ({
    rows: [items[0]],
    total: 30,
    page: 1,
    totalPages: 3,
    search: null,
    selectedFilters: [],
    selectedBody: null,
    pending: false,
    setFilters: jest.fn(),
    setBody: jest.fn(),
    setPage: jest.fn(),
    hrefForPage: page => `?page=${page}`,
    ...overrides,
});

const drawServer = (state: CollectionState<Item, string>) => (
    <List<Item, {}, string> state={state} editable={false} ItemComponent={Card} FormComponent={() => null} formProps={{}} t={t} />
);

const count = () => screen.queryByText('items:2');
// Closed, the control is an icon button under the same label; the field only
// exists once it is opened.
const searchToggle = () => screen.queryByRole('button', { name: 'searchItems' });
const searchBox = () => screen.queryByPlaceholderText('searchItems');

const openSearch = () => {
    const toggle = searchToggle();
    if (toggle) fireEvent.click(toggle);
};

const search = (query: string) => {
    openSearch();
    fireEvent.change(screen.getByPlaceholderText('searchItems'), { target: { value: query } });
};

const shownNames = () => people.filter(person => screen.queryByText(person.name)).map(person => person.name);

/** The rows as rendered, in document order. */
const renderedNames = () => screen.queryAllByTestId('row').map(row => row.textContent);

beforeEach(() => {
    mockSearchParams = new URLSearchParams();
});

describe('List — search and count visibility', () => {
    it('shows the count, and the search as an icon until it is opened', () => {
        renderList();
        expect(count()).toBeInTheDocument();
        expect(searchToggle()).toBeInTheDocument();
        expect(searchBox()).not.toBeInTheDocument();

        openSearch();
        expect(searchBox()).toBeInTheDocument();
    });

    it('opens on a shared link that already carries a query', () => {
        mockSearchParams = new URLSearchParams('search=παπα');
        renderList({ items: people, searchKeys: item => [item.name] });
        expect(searchBox()).toBeInTheDocument();
        expect(searchToggle()).not.toBeInTheDocument();
    });

    it('hides both when the source has no search and nothing overrides the count', () => {
        renderFixedList();
        expect(count()).not.toBeInTheDocument();
        expect(searchToggle()).not.toBeInTheDocument();
    });

    it('keeps the count when the source has no search but the count is asked for', () => {
        renderFixedList({ showCount: true });
        expect(count()).toBeInTheDocument();
        expect(searchToggle()).not.toBeInTheDocument();
    });

    it('can drop the count while keeping search', () => {
        renderList({ showCount: false });
        expect(count()).not.toBeInTheDocument();
        expect(searchToggle()).toBeInTheDocument();
    });

    it('still renders the editor affordance when both are off', () => {
        renderFixedList({ editable: true });
        expect(count()).not.toBeInTheDocument();
        expect(screen.getByText('add-sheet')).toBeInTheDocument();
    });
});

describe('List — what a row is searchable by', () => {
    it('matches a nested value that the item\'s own fields cannot see', () => {
        renderList({ items: people, searchKeys: item => [item.name, ...roleNames(item)] });
        search('Δήμαρχος');
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);
    });

    it('falls back to the top-level strings when no keys are given', () => {
        // The same query, with the roles now invisible to the filter.
        renderList({ items: people });
        search('Δήμαρχος');
        expect(shownNames()).toEqual([]);
        expect(screen.getByText('noItems')).toBeInTheDocument();

        search('Παπαδοπούλου');
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);
    });

    it('ignores case and τόνοι on both sides', () => {
        renderList({ items: people, searchKeys: item => [item.name] });
        search('μαρια');
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);
    });

    it('requires every word of the query to match, in any order', () => {
        renderList({ items: people, searchKeys: item => [item.name] });

        search('μαρια παπα');
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);

        search('παπα μαρια');
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);

        // "παπα" alone is shared by both surnames — the second word is what
        // narrows the list, so it has to be an AND and not an OR.
        search('παπα');
        expect(shownNames()).toHaveLength(2);

        search('μαρια γιωργος');
        expect(shownNames()).toEqual([]);
    });

    it('narrows the count and the list from a shared ?search= link', () => {
        mockSearchParams = new URLSearchParams('search=δημαρχος');
        renderList({ items: people, searchKeys: item => [item.name, ...roleNames(item)] });
        expect(shownNames()).toEqual(['Μαρία Παπαδοπούλου']);
        expect(screen.getByText('items:1')).toBeInTheDocument();
    });
});

describe('List — ordering the rows', () => {
    it('renders the rows in the order the hook returns', () => {
        renderList({ items: people, sortItems: rows => [...rows].reverse() });
        expect(renderedNames()).toEqual([people[1].name, people[0].name]);
    });

    it('hands the hook the rows that passed the search, not every row', () => {
        const sortItems = jest.fn((rows: Item[]) => rows);
        renderList({ items: people, searchKeys: item => [item.name], sortItems });
        search('Παπαδοπούλου');
        const [rows] = sortItems.mock.calls[sortItems.mock.calls.length - 1];
        expect(rows.map(row => row.id)).toEqual(['p1']);
    });

    it('hands the hook the current selection, not an empty one', () => {
        mockSearchParams = new URLSearchParams('filters=council');
        const sortItems = jest.fn((rows: Item[], _selected: (string | undefined)[], _body: string | null) => rows);
        renderList({
            items: people,
            sortItems,
            filterAvailableValues: [{ value: 'council', label: 'council' }],
        });
        const [, selected] = sortItems.mock.calls[sortItems.mock.calls.length - 1];
        expect(selected).toEqual(['council']);
    });
});

describe('List — paging and scrolling', () => {
    const scrollIntoView = jest.fn();

    beforeEach(() => {
        scrollIntoView.mockClear();
        Element.prototype.scrollIntoView = scrollIntoView;
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('scrolls only once the page the reader picked has landed', () => {
        const { rerender } = render(drawServer(serverState()));
        fireEvent.click(screen.getByRole('link', { name: '3' }));
        rerender(drawServer(serverState({ pending: true })));
        expect(scrollIntoView).not.toHaveBeenCalled();
        rerender(drawServer(serverState({ page: 3 })));
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('scrolls when the reader picks the page already on screen, and leaves no scroll for later', () => {
        const { rerender } = render(drawServer(serverState({ page: 2 })));
        fireEvent.click(screen.getByRole('link', { name: '2' }));
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        // A later page change the reader did not make through the pager: a
        // filter or a search sends the list back to page 1.
        rerender(drawServer(serverState({ page: 1 })));
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('renders the pager as links to each page, in a named navigation', () => {
        render(drawServer(serverState()));
        expect(screen.getByRole('navigation', { name: 'pagination' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '?page=2');
        expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('aria-current', 'page');
    });

    it('draws no pager for a source with one page', () => {
        renderList();
        expect(screen.queryByRole('navigation')).toBeNull();
    });
});

describe('List — trailing rows', () => {
    it('lists the matching rows under their own heading, and counts them in the total', () => {
        renderList({ items: people, showCount: true, trailing: { title: 'former', matches: item => item.id === 'p2' } });
        expect(screen.getByText('items:2')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'former' })).toBeInTheDocument();
        expect(renderedNames()).toEqual([people[0].name, people[1].name]);
    });
});

describe('List — status for assistive technology', () => {
    it('announces the count as a status message when asked', () => {
        renderList({ showCount: true, announceCount: true });
        expect(screen.getByRole('status')).toHaveTextContent('items:2');
    });

    it('keeps the count quiet by default, so filtering as the reader types reads no number per letter', () => {
        renderList({ showCount: true });
        expect(count()).toBeInTheDocument();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('marks the rows busy while a page loads', () => {
        renderList({ pending: true });
        expect(screen.getByTestId('collection-rows')).toHaveAttribute('aria-busy', 'true');
    });
});
