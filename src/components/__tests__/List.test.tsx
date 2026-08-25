import { render, screen } from '@testing-library/react';
import List from '../List';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    usePathname: () => '/chania',
    useSearchParams: () => new URLSearchParams(),
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

type Item = { id: string; name: string };

const items: Item[] = [
    { id: '1', name: 'Δημοτικό Συμβούλιο 05/08/26' },
    { id: '2', name: 'Δημοτική Επιτροπή 10/08/26' },
];

const Card = ({ item }: { item: Item }) => <div>{item.name}</div>;

const t = (key: string, params?: { count?: number }) =>
    params?.count === undefined ? key : `${key}:${params.count}`;

function renderList(props: { showSearch?: boolean; showCount?: boolean; editable?: boolean } = {}) {
    const { editable = false, ...flags } = props;
    return render(
        <List<Item>
            items={items}
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
const searchBox = () => screen.queryByPlaceholderText('searchItems');

describe('List — search and count visibility', () => {
    it('shows both by default', () => {
        renderList();
        expect(count()).toBeInTheDocument();
        expect(searchBox()).toBeInTheDocument();
    });

    it('hides both when search is off and nothing overrides the count', () => {
        renderList({ showSearch: false });
        expect(count()).not.toBeInTheDocument();
        expect(searchBox()).not.toBeInTheDocument();
    });

    it('keeps the count when search is off but the count is asked for', () => {
        // The city tabs drop the search box in favour of the page's single search,
        // but the filtered count still has to be readable.
        renderList({ showSearch: false, showCount: true });
        expect(count()).toBeInTheDocument();
        expect(searchBox()).not.toBeInTheDocument();
    });

    it('can drop the count while keeping search', () => {
        renderList({ showCount: false });
        expect(count()).not.toBeInTheDocument();
        expect(searchBox()).toBeInTheDocument();
    });

    it('still renders the editor affordance when both are off', () => {
        renderList({ showSearch: false, editable: true });
        expect(count()).not.toBeInTheDocument();
        expect(screen.getByText('add-sheet')).toBeInTheDocument();
    });
});
