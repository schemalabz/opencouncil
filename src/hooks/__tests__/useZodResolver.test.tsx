// useZodResolver follows a locale change without a remount: the default zod
// message of the next submit is in the new language.
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useZodResolver } from '@/hooks/useLocalizedValidation';

const schema = z.object({ n: z.number().min(0) });

function Form() {
    const { handleSubmit, formState: { errors } } = useForm<z.input<typeof schema>>({
        resolver: useZodResolver(schema), defaultValues: { n: -5 },
    });
    return <form onSubmit={handleSubmit(() => undefined)}><span data-testid="err">{errors.n?.message}</span></form>;
}

const wrap = (locale: string) => (
    <NextIntlClientProvider locale={locale} messages={{}} onError={() => undefined}><Form /></NextIntlClientProvider>
);

it('gives the default zod message in the new locale after a switch', async () => {
    const view = render(wrap('el'));
    await act(async () => { fireEvent.submit(view.container.querySelector('form')!); });
    await waitFor(() => expect(view.getByTestId('err').textContent).toMatch(/^Πολύ μικρό/));
    view.rerender(wrap('sr'));
    await act(async () => { fireEvent.submit(view.container.querySelector('form')!); });
    await waitFor(() => expect(view.getByTestId('err').textContent).toBe('Премало: број мора бити најмање 0'));
});
