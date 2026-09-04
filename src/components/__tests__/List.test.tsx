import { fireEvent, render, screen } from '@testing-library/react';
import List from '../List';

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

const Card = ({ item }: { item: Item }) => <div>{item.name}</div>;

const t = (key: string, params?: { count?: number }) =>
    params?.count === undefined ? key : `${key}:${params.count}`;

type RenderProps = {
    showSearch?: boolean;
    showCount?: boolean;
    editable?: boolean;
    items?: Item[];
    searchKeys?: (item: Item) => (string | null | undefined)[];
};

function renderList(props: RenderProps = {}) {
    const { editable = false, items: rows = items, ...flags } = props;
    return render(
        <List<Item>
            items={rows}
            editable={editable}
            ItemComponent={Card}
            FormComponent={() => null}
            formProps={{}}
            t={t}
            {...flags}
        />,
    );
}

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

    it('hides both when search is off and nothing overrides the count', () => {
        renderList({ showSearch: false });
        expect(count()).not.toBeInTheDocument();
        expect(searchToggle()).not.toBeInTheDocument();
    });

    it('keeps the count when search is off but the count is asked for', () => {
        // The city tabs drop the search box in favour of the page's single search,
        // but the filtered count still has to be readable.
        renderList({ showSearch: false, showCount: true });
        expect(count()).toBeInTheDocument();
        expect(searchToggle()).not.toBeInTheDocument();
    });

    it('can drop the count while keeping search', () => {
        renderList({ showCount: false });
        expect(count()).not.toBeInTheDocument();
        expect(searchToggle()).toBeInTheDocument();
    });

    it('still renders the editor affordance when both are off', () => {
        renderList({ showSearch: false, editable: true });
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
