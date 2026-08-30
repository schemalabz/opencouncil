import { render, screen } from '@testing-library/react';
import { BadgePicker } from '../badge-picker';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
// The option glyphs reach lucide's ESM icon map through @/components/icon,
// which ts-jest cannot transform. The hints under test do not need it.
jest.mock('@/components/icon', () => ({ __esModule: true, default: () => null }));
jest.mock('framer-motion', () => ({
    motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('BadgePicker hints', () => {
    test('renders a static hint after the label and passes the selected state to a function hint', () => {
        render(
            <BadgePicker
                options={[
                    { value: 'a', label: 'Alpha', hint: <b data-testid="static">7</b> },
                    { value: 'b', label: 'Beta', hint: selected => <i data-testid="fn">{selected ? 'on' : 'off'}</i> },
                ]}
                selectedValues={['b']}
                onSelectionChange={() => undefined}
                allLabel="All"
                collapsible={false}
            />,
        );
        // The non-collapsible picker renders a mobile and a desktop copy.
        expect(screen.getAllByTestId('static').map(e => e.textContent)).toEqual(['7', '7']);
        expect(screen.getAllByTestId('fn').map(e => e.textContent)).toEqual(['on', 'on']);
        expect(screen.getAllByRole('button', { pressed: true }).map(b => b.textContent)).toEqual(['Betaon', 'Betaon']);
    });
});
