import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import el from '../../../../messages/el.json';
import { CityNavigation } from '../CityNavigation';

jest.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => 'meetings' }));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function renderNavigation(props: Partial<React.ComponentProps<typeof CityNavigation>>) {
    return render(
        <NextIntlClientProvider locale="el" messages={el}>
            <CityNavigation cityId="papagos-cholargos" city={{ consultationsEnabled: true }} {...props} />
        </NextIntlClientProvider>
    );
}

describe('CityNavigation', () => {
    it('shows how many consultations are open on the consultations tab', () => {
        renderNavigation({ openConsultations: 2 });

        const tab = screen.getByRole('link', { name: /Διαβουλεύσεις/ });
        expect(tab).toHaveAccessibleName('Διαβουλεύσεις 2 ανοιχτές διαβουλεύσεις');
        expect(tab).toHaveTextContent('2');
    });

    it('names one open consultation in the singular', () => {
        renderNavigation({ openConsultations: 1 });
        expect(screen.getByRole('link', { name: /Διαβουλεύσεις/ })).toHaveAccessibleName('Διαβουλεύσεις 1 ανοιχτή διαβούλευση');
    });

    it('shows no number when none is open', () => {
        renderNavigation({ openConsultations: 0 });
        expect(screen.getByRole('link', { name: /Διαβουλεύσεις/ })).toHaveAccessibleName('Διαβουλεύσεις');
    });

    it('clips the badge\'s hidden label inside the scrolling nav', () => {
        renderNavigation({ openConsultations: 2 });

        // The `sr-only` label is absolutely positioned. The nav must be its
        // containing block, or it escapes the overflow clipping and widens the
        // page on a phone. jsdom does no layout, so the class is the check.
        const nav = screen.getByRole('navigation');
        expect(nav).toHaveClass('relative', 'overflow-x-auto');
        expect(nav).toContainElement(screen.getByText('2 ανοιχτές διαβουλεύσεις'));
    });

    it('has no consultations tab for a city without consultations', () => {
        renderNavigation({ city: { consultationsEnabled: false }, openConsultations: 3 });
        expect(screen.queryByRole('link', { name: /Διαβουλεύσεις/ })).toBeNull();
    });
});
