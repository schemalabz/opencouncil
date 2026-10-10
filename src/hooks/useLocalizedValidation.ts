"use client";

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type * as z from 'zod';
import { zodErrorMap } from '@/lib/zod-schemas/locales';
import { VALIDATION_NAMESPACE, validationMessageKey } from '@/lib/zod-schemas/messages';

/**
 * The resolver of every react-hook-form form with a zod schema. The default zod
 * messages come in the language of the reader. A message that the schema sets
 * stays English here; `useValidationMessage` translates it on display.
 */
export function useZodResolver<Input extends FieldValues, Output>(
    schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
    const locale = useLocale();
    return useMemo(() => zodResolver(schema, { error: zodErrorMap(locale) }), [schema, locale]);
}

/**
 * Shows a validation message in the language of the reader. A message from
 * `vmsg` becomes the translation of its key in the `validation` namespace.
 * Any other message (a default zod message, which `useZodResolver` already
 * localized) shows as it is.
 */
export function useValidationMessage(): (message: string) => string {
    const t = useTranslations(VALIDATION_NAMESPACE);
    return useCallback((message: string) => {
        const key = validationMessageKey(message);
        return key ? t(key) : message;
    }, [t]);
}
