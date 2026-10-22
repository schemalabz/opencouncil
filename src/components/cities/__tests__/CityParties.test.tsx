import { act, render } from '@testing-library/react';
import CityParties from '../CityParties';
import type { CollectionState } from '@/components/collection/types';
import type { PartyWithPersons } from '@/lib/db/parties';

const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    useSearchParams: () => mockSearchParams,
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'el',
}));

jest.mock('@/components/parties/PartyCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/parties/PartyForm', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/sorting/parties', () => ({ sortParties: <T,>(parties: T[]) => parties }));
jest.mock('@/lib/party/composition', () => ({ partyBodyColumns: () => [] }));

let state: CollectionState<PartyWithPersons, string>;
jest.mock('@/components/List', () => ({
    __esModule: true,
    default: (props: { state: CollectionState<PartyWithPersons, string> }) => {
        state = props.state;
        return null;
    },
}));

const party = (id: string, name: string, members: string[]) => ({
    id,
    name,
    name_en: name,
    name_short: name,
    name_short_en: name,
    people: members.map(member => ({ id: member, name: member, name_en: member })),
}) as unknown as PartyWithPersons;

describe('CityParties', () => {
    it('finds a party by the name of one of its members', () => {
        render(<CityParties partiesWithPersons={[party('a', 'Πρώτη Παράταξη', ['Μαρία Παπαδοπούλου']), party('b', 'Δεύτερη Παράταξη', ['Γιώργος Νικολάου'])]} cityId="chania" canEdit={false} />);
        act(() => state.search!.setQuery('παπαδοπουλου'));
        expect(state.rows.map(p => p.id)).toEqual(['a']);
    });
});
