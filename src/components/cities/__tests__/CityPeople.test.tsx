import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import CityPeople from '../CityPeople';
import type { CollectionState } from '@/components/collection/types';
import type { PersonWithRelations } from '@/lib/db/people';
import { sortBodyMembers } from '@/lib/sorting/people';

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    useSearchParams: () => mockSearchParams,
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'el',
}));

jest.mock('@/hooks/useRoleTitles', () => ({ useRoleTitles: () => ({}) }));
jest.mock('@/components/persons/PersonCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/persons/PersonForm', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/admin/people/ElectedOrderSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/admin/AdminStrip', () => ({
    AdminToolButton: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

// The order is the sorting module's own concern; here it only has to be the one asked for.
jest.mock('@/lib/sorting/people', () => ({
    sortPeople: (items: unknown[]) => items,
    sortBodyMembers: jest.fn((items: unknown[]) => [...items].reverse()),
}));

type BadgeProps = { options: { value: string }[]; onSelectionChange: (values: string[]) => void };
let bodyPicker: BadgeProps | null;
jest.mock('@/components/ui/badge-picker', () => ({
    BadgePicker: (props: BadgeProps) => {
        bodyPicker = props;
        return null;
    },
}));

type ListProps = {
    state: CollectionState<PersonWithRelations, string>;
    adminTools: (selected: string[]) => ReactNode;
    renderAfterFilters: (selected: string[]) => ReactNode;
};
let listProps: ListProps;
jest.mock('@/components/List', () => ({
    __esModule: true,
    default: (props: ListProps) => {
        listProps = props;
        return <>{props.renderAfterFilters(props.state.selectedFilters)}</>;
    },
}));

const body = (id: string, name: string) => ({ id, type: 'community' as const, name, name_en: name });

const member = (id: string, bodyId: string, bodyName: string) => ({
    id,
    name: `Πρόσωπο ${id}`,
    name_en: `Person ${id}`,
    name_short: id,
    name_short_en: id,
    roles: [{
        id: `role-${id}`,
        personId: id,
        administrativeBodyId: bodyId,
        administrativeBody: body(bodyId, bodyName),
        cityId: null,
        partyId: null,
        party: null,
        name: null,
        name_en: null,
        isHead: false,
        startDate: null,
        endDate: null,
    }],
}) as unknown as PersonWithRelations;

const people = [
    member('p1', 'body-a', 'Κοινότητα Α'),
    member('p2', 'body-b', 'Κοινότητα Β'),
    member('p3', 'body-a', 'Κοινότητα Α'),
];

const draw = (query: string) => {
    mockSearchParams = new URLSearchParams(query);
    bodyPicker = null;
    return render(
        <CityPeople
            allPeople={people}
            partiesWithPersons={[]}
            administrativeBodies={[]}
            cityId="chania"
            canEdit={false}
            isSuperAdmin
            showSecondary={false}
        />
    );
};

const oneBody = `filters=adminBodyType_community&body=${encodeURIComponent('Κοινότητα Α')}`;

describe('CityPeople', () => {
    it('lists only the members of the body in the URL, in that body\'s order', () => {
        draw(oneBody);
        expect(listProps.state.rows.map(p => p.id)).toEqual(['p3', 'p1']);
        expect(sortBodyMembers).toHaveBeenLastCalledWith(expect.anything(), 'body-a');
    });

    it('offers the elected-order tool for the body in the URL, though its type has two bodies', () => {
        draw(oneBody);
        expect(listProps.adminTools(['community'])).not.toBeNull();
        draw('filters=adminBodyType_community');
        expect(listProps.adminTools(['community'])).toBeNull();
    });

    it('writes a body pick to the URL', () => {
        const push = jest.spyOn(window.history, 'pushState');
        draw('filters=adminBodyType_community');
        expect(bodyPicker!.options.map(o => o.value)).toEqual(['body-a', 'body-b']);
        act(() => bodyPicker!.onSelectionChange(['body-b']));
        expect(push).toHaveBeenLastCalledWith(null, '', `?${new URLSearchParams({ filters: 'adminBodyType_community', body: 'Κοινότητα Β' })}`);
        push.mockRestore();
    });
});
