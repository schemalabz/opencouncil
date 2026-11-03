import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TaskStatus } from '@prisma/client';
import { TaskStatusComponent } from './TaskStatus';
import { encodeMediaFailureResponse } from '@/lib/tasks/taskResponse';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/lib/actions/tasks', () => ({ processTaskResponse: jest.fn() }));
jest.mock('@/components/RelativeTime', () => ({ RelativeTime: () => <span>now</span> }));
jest.mock('@/components/ui/json-metadata-dialog', () => ({ JsonMetadataDialog: () => null }));
jest.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));

it.each([
    [encodeMediaFailureResponse({ reason: 'error', retryable: true }), true],
    [null, true],
    ['legacy error prose', false],
    [JSON.stringify({ source: { kind: 'file' }, transcript: {} }), false],
])('blocks replay for failure metadata or absent results: %s', (responseBody, disabled) => {
    const task: TaskStatus = { id: 'task', type: 'transcribe', status: 'failed', stage: null, percentComplete: null,
        version: 6, createdAt: new Date(), updatedAt: new Date(), cityId: 'city', councilMeetingId: 'meeting',
        requestBody: '{}', responseBody, failureReason: 'Source failed' };
    const { container } = render(<TaskStatusComponent task={task} onDelete={jest.fn()} />);
    fireEvent.click(screen.getByText('transcribe'));
    const button = container.querySelector('.lucide-refresh-cw')?.closest('button');
    expect(button).toBeTruthy();
    if (disabled) expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
});


it('does not add transcript parsing for task replay controls', () => {
    const responseBody = JSON.stringify({ transcript: 'x'.repeat(500_000) });
    const task: TaskStatus = { id: 'large-task', type: 'transcribe', status: 'failed', stage: null,
        percentComplete: null, version: 6, createdAt: new Date(), updatedAt: new Date(), cityId: 'city',
        councilMeetingId: 'meeting', requestBody: '{}', responseBody, failureReason: 'Import failed' };
    const parse = jest.spyOn(JSON, 'parse');
    try {
        render(<TaskStatusComponent task={task} onDelete={jest.fn()} />);
        fireEvent.click(screen.getByText('transcribe'));
        expect(parse.mock.calls.filter(([body]) => body === responseBody))
            .toHaveLength(parse.mock.calls.filter(([body]) => body === task.requestBody).length);
    } finally {
        parse.mockRestore();
    }
});
