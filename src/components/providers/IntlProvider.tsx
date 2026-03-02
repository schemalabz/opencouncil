"use client";

import { NextIntlClientProvider, AbstractIntlMessages } from "next-intl";
import { ReactNode, useMemo } from "react";
import { createOnError, createGetMessageFallback } from "@/i18n/fallback";

interface IntlProviderProps {
    locale: string;
    messages: AbstractIntlMessages;
    greekMessages: AbstractIntlMessages;
    children: ReactNode;
}

export function IntlProvider({ locale, messages, greekMessages, children }: IntlProviderProps) {
    // Memoize handlers to avoid recreating on every render
    const onError = useMemo(() => createOnError(), []);
    const getMessageFallback = useMemo(
        () => createGetMessageFallback(greekMessages as Record<string, unknown>), 
        [greekMessages]
    );

    return (
        <NextIntlClientProvider
            locale={locale}
            messages={messages}
            onError={onError}
            getMessageFallback={getMessageFallback}
        >
            {children}
        </NextIntlClientProvider>
    );
}
