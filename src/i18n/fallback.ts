import { IntlErrorCode } from 'next-intl';

type IntlError = {
    code: string;
    message: string;
};

type MessageFallbackParams = {
    namespace?: string;
    key: string;
};

// Helper to get nested value from object using dot notation
export function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
        if (current === undefined || current === null) return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return typeof current === 'string' ? current : undefined;
}

// Creates an onError handler for next-intl that logs missing translations in development
export function createOnError() {
    return (error: IntlError) => {
        if (process.env.NODE_ENV === 'development') {
            if (error.code === IntlErrorCode.MISSING_MESSAGE) {
                console.warn(`Missing translation: ${error.message}`);
            } else {
                console.error(error);
            }
        }
    };
}

// Creates a getMessageFallback handler that falls back to Greek translations
export function createGetMessageFallback(greekMessages: Record<string, unknown>) {
    return ({ namespace, key }: MessageFallbackParams): string => {
        const fullKey = namespace ? `${namespace}.${key}` : key;
        const fallback = getNestedValue(greekMessages, fullKey);
        if (fallback) {
            return fallback;
        }
        // If no Greek fallback exists, return the key itself
        return `[${fullKey}]`;
    };
}
