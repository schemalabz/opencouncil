import { render, screen } from '@testing-library/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';

it('portals the tooltip outside paint-contained and clipped ancestors while retaining its accessible association', async () => {
    render(<TooltipProvider><div data-testid="sticky-header" style={{ overflow: 'hidden', contain: 'paint' }}>
        <Tooltip defaultOpen>
            <TooltipTrigger asChild><button>Copy segment</button></TooltipTrigger>
            <TooltipContent>Copy this speaker segment</TooltipContent>
        </Tooltip>
    </div></TooltipProvider>);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Copy this speaker segment');
    expect(document.body).toContainElement(tooltip);
    expect(screen.getByTestId('sticky-header')).not.toContainElement(tooltip);
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tooltip.id);
});
