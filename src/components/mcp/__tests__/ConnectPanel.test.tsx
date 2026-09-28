import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectPanel } from '../ConnectPanel';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('next/image', () => ({
    __esModule: true,
    default: ({ alt }: { alt: string }) => createElement('img', { alt }),
}));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

const serverUrl = 'https://opencouncil.cy/mcp';

function renderPanel() {
    return render(<ConnectPanel serverUrl={serverUrl} videoUrl="https://example.com/video" />);
}

describe('ConnectPanel', () => {
    it('opens with a one-click link that hands claude.ai the realm address', () => {
        renderPanel();

        expect(screen.getByRole('link', { name: 'addToClaude' })).toHaveAttribute(
            'href',
            'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=OpenCouncil&connectorUrl=https%3A%2F%2Fopencouncil.cy%2Fmcp'
        );
    });

    it('keeps the manual steps for ChatGPT, which has no such link', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('tab', { name: 'clients.chatgpt.title' }));

        expect(screen.queryByRole('link', { name: 'addToClaude' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /clients.chatgpt.openSettings/ })).toHaveAttribute(
            'href',
            'https://chatgpt.com/#settings/Connectors'
        );
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });
});
