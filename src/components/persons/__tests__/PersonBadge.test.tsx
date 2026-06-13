import { render, screen, fireEvent } from '@testing-library/react';
import { SpeakerTag } from '@prisma/client';
import { PersonBadge } from '../PersonBadge';
import { PersonWithRelations } from '@/lib/db/people';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

// The avatar and role rendering aren't under test here; keep them out of the
// way so the picker's own text is the only thing we assert on.
jest.mock('@/components/ImageOrInitials', () => ({
    ImageOrInitials: () => <span data-testid="avatar" />,
}));
jest.mock('@/components/persons/RoleDisplay', () => ({
    RoleDisplay: () => null,
}));

// Radix Popover + cmdk reach for a handful of DOM APIs jsdom doesn't implement.
beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

const makePerson = (
    overrides: Partial<PersonWithRelations> & { id: string; name: string },
): PersonWithRelations => ({
    name_en: '',
    name_short: '',
    name_short_en: '',
    image: null,
    activeFrom: null,
    activeTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profileUrl: null,
    cityId: 'athens',
    roles: [],
    ...overrides,
});

const speakerTag: SpeakerTag = {
    id: 'tag-1',
    label: 'Speaker 1',
    personId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const people: PersonWithRelations[] = [
    makePerson({ id: 'p1', name: 'Παπαδόπουλος' }),
    makePerson({ id: 'p2', name: 'Σαλαμανή' }),
];

const renderBadge = (props: Partial<React.ComponentProps<typeof PersonBadge>> = {}) =>
    render(
        <PersonBadge
            editable
            speakerTag={speakerTag}
            availablePeople={people}
            onPersonChange={jest.fn()}
            onLabelChange={jest.fn()}
            {...props}
        />,
    );

// Click the speaker badge to open the re-assignment popover, then type a query.
const search = (query: string) => {
    fireEvent.click(screen.getByText('Speaker 1'));
    fireEvent.change(screen.getByPlaceholderText('Search people...'), {
        target: { value: query },
    });
};

describe('PersonBadge editable speaker picker', () => {
    it('offers a custom label for a name that matches no person', () => {
        // Regression: the "Set label" fallback used to vanish while typing, so a
        // speaker who is not in the database could no longer be given a label.
        renderBadge();
        search('Ζζζ');

        expect(screen.getByText('Set label to "Ζζζ"')).toBeInTheDocument();
        expect(screen.queryByText('Παπαδόπουλος')).not.toBeInTheDocument();
    });

    it('keeps the custom-label option alongside a matching person', () => {
        renderBadge();
        search('Παπ');

        // The matching person ranks in...
        expect(screen.getByText('Παπαδόπουλος')).toBeInTheDocument();
        // ...the non-matching one is filtered out...
        expect(screen.queryByText('Σαλαμανή')).not.toBeInTheDocument();
        // ...and the custom-label fallback is still offered below it.
        expect(screen.getByText('Set label to "Παπ"')).toBeInTheDocument();
    });

    it('applies the typed label via onLabelChange and clears the person', () => {
        const onPersonChange = jest.fn();
        const onLabelChange = jest.fn();
        renderBadge({ onPersonChange, onLabelChange });

        search('Ζζζ');
        fireEvent.click(screen.getByText('Set label to "Ζζζ"'));

        expect(onPersonChange).toHaveBeenCalledWith(null);
        expect(onLabelChange).toHaveBeenCalledWith('Ζζζ');
    });

    it('highlights the top match while searching, so Enter picks the person', () => {
        // cmdk auto-selects the first item in the list. The quick actions must
        // not sit above the matches, or Enter would assign "unknown speaker"
        // instead of the person the user just typed.
        renderBadge();
        search('Παπ');

        const selected = document.querySelector('[cmdk-item=""][aria-selected="true"]');
        expect(selected?.textContent).toContain('Παπαδόπουλος');
    });

    it('shows quick actions only when not searching', () => {
        renderBadge();
        // Open with no query: the "unknown speaker" quick action is offered.
        fireEvent.click(screen.getByText('Speaker 1'));
        expect(screen.getByText('Άγνωστος Ομιλητής')).toBeInTheDocument();

        // Once searching, it gives way to the matches + the "set label" fallback.
        fireEvent.change(screen.getByPlaceholderText('Search people...'), {
            target: { value: 'Παπ' },
        });
        expect(screen.queryByText('Άγνωστος Ομιλητής')).not.toBeInTheDocument();
    });
});
