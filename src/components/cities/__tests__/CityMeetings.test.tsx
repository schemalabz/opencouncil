import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import CityMeetings from '../CityMeetings';
import type { CollectionState } from '@/components/collection/types';
import type { PublicAdministrativeBody } from '@/lib/db/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

jest.mock('@/components/meetings/MeetingCardV2', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/meetings/AddMeetingForm', () => ({ __esModule: true, default: () => null }));

// The view and the picker are drawn elsewhere; this file checks what the tab hands them.
type ListProps = {
    state: CollectionState<unknown, string>;
    announceCount?: boolean;
    renderFilter?: (props: { selectedValues: string[]; onChange: (values: string[]) => void }) => ReactNode;
};
let listProps: ListProps;
jest.mock('@/components/List', () => ({
    __esModule: true,
    default: (props: ListProps) => {
        listProps = props;
        return <>{props.renderFilter?.({ selectedValues: props.state.selectedFilters, onChange: props.state.setFilters })}</>;
    },
}));

type PickerProps = {
    groups: { type: string; bodies: { value: string; label: string }[] }[];
    selectedBodyId: string | null;
    onBodyChange: (bodyId: string | null) => void;
    onTypeChange: (type: string | null) => void;
};
let pickerProps: PickerProps;
jest.mock('@/components/ui/admin-body-picker', () => ({
    AdminBodyPicker: (props: PickerProps) => {
        pickerProps = props;
        return null;
    },
}));

const setBody = jest.fn();
const setFilters = jest.fn();
let selected: { filters: string[]; body: string | null } = { filters: ['community'], body: 'body-a' };
jest.mock('@/components/collection/useServerCollection', () => ({
    useServerCollection: () => ({
        rows: [],
        total: 0,
        page: 1,
        totalPages: 1,
        search: { query: '', setQuery: () => {} },
        selectedFilters: selected.filters,
        selectedBody: selected.body,
        pending: false,
        setFilters,
        setBody,
        setPage: () => {},
        hrefForPage: () => '?',
    }),
}));

const body = (id: string, type: PublicAdministrativeBody['type'], name: string) =>
    ({ id, type, name, name_en: name }) as PublicAdministrativeBody;

const bodies = [
    body('council', 'council', 'Δημοτικό Συμβούλιο'),
    body('body-a', 'community', 'Κοινότητα Α'),
    body('body-b', 'community', 'Κοινότητα Β'),
];

const draw = () => render(
    <CityMeetings
        rows={[]}
        total={0}
        page={1}
        pageSize={12}
        cityId="chania"
        realm="greece"
        timezone="Europe/Athens"
        canEdit={false}
        administrativeBodies={bodies}
        now={new Date('2026-10-22T10:00:00Z')}
    />
);

beforeEach(() => {
    setBody.mockClear();
    setFilters.mockClear();
    selected = { filters: ['community'], body: 'body-a' };
});

describe('CityMeetings', () => {
    it('announces the count, since its results arrive after a server round trip', () => {
        draw();
        expect(listProps.announceCount).toBe(true);
    });

    it('offers the bodies of each type except the council', () => {
        draw();
        const byType = Object.fromEntries(pickerProps.groups.map(group => [group.type, group.bodies.map(b => b.value)]));
        expect(byType).toEqual({ council: [], community: ['body-a', 'body-b'] });
    });

    it('shows the selected body and sends a body pick to the source', () => {
        draw();
        expect(pickerProps.selectedBodyId).toBe('body-a');
        pickerProps.onBodyChange('body-b');
        expect(setBody).toHaveBeenCalledWith('body-b');
    });

    it('sends "all types" as an empty selection, not as the council', () => {
        draw();
        pickerProps.onTypeChange(null);
        expect(setFilters).toHaveBeenCalledWith([]);
        pickerProps.onTypeChange('community');
        expect(setFilters).toHaveBeenLastCalledWith(['community']);
    });
});
