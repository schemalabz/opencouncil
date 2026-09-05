'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { AlertCircle, X } from 'lucide-react';
import { Input } from './input';
import { type PhoneRejection, isPhoneEmpty, toMobileE164 } from './lib/phone';

export interface PhoneFieldValidity {
    isActive: boolean;
    isEmpty: boolean;
    isValid: boolean;
    /** Why the value is not a phone we can message; null when valid or empty. */
    reason: PhoneRejection | null;
}

interface PhoneFieldProps {
    value: string;
    onChange: (value: string) => void;
    onValidityChange?: (validity: PhoneFieldValidity) => void;
    placeholder?: string;
    activePlaceholder?: string;
    invalidMessage?: string;
    /** Shown instead of invalidMessage when the number is a landline. */
    notMobileMessage?: string;
    id?: string;
}

export function PhoneField({
    value,
    onChange,
    onValidityChange,
    placeholder,
    activePlaceholder,
    invalidMessage,
    notMobileMessage,
    id = 'phone',
}: PhoneFieldProps) {
    const [active, setActive] = useState(!isPhoneEmpty(value));
    const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

    // If the parent pushes a non-empty value after mount (e.g. async session
    // load), promote the field to active so the number is visible.
    const prevValueRef = useRef(value);
    useEffect(() => {
        if (!active && !isPhoneEmpty(value) && isPhoneEmpty(prevValueRef.current)) {
            setActive(true);
        }
        prevValueRef.current = value;
    }, [value, active]);

    const isEmpty = isPhoneEmpty(value);
    const parsed = toMobileE164(value);
    const isValid = parsed.ok;
    const reason: PhoneRejection | null = isEmpty || parsed.ok ? null : parsed.reason;
    const showError = active && !isEmpty && !isValid;
    const errorMessage = reason === 'landline' ? (notMobileMessage ?? invalidMessage) : invalidMessage;

    // Emit validity changes without causing render loops when the parent
    // passes an unmemoized callback: track the last emitted state via a ref.
    const onValidityChangeRef = useRef(onValidityChange);
    onValidityChangeRef.current = onValidityChange;
    const lastEmittedRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const key = `${active}|${isEmpty}|${isValid}|${reason}`;
        if (lastEmittedRef.current !== key) {
            lastEmittedRef.current = key;
            onValidityChangeRef.current?.({ isActive: active, isEmpty, isValid, reason });
        }
    }, [active, isEmpty, isValid, reason]);

    return (
        <>
            {active ? (
                <div className="phone-input-container relative">
                    <PhoneInput
                        defaultCountry="gr"
                        // The dial code cannot be deleted: a reader who types
                        // a national number on top of it gets `+30 69…`, not
                        // `+69…`. Another country is chosen from the flag.
                        forceDialCode
                        value={value}
                        onChange={(next) => onChange(next)}
                        inputProps={{ autoFocus: shouldAutoFocus, id }}
                        inputClassName="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-8"
                        placeholder={activePlaceholder}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            onChange('');
                            setActive(false);
                            setShouldAutoFocus(false);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <Input
                    id={id}
                    type="text"
                    placeholder={placeholder}
                    onFocus={() => {
                        setActive(true);
                        setShouldAutoFocus(true);
                    }}
                    readOnly
                    className="h-11 md:h-10 text-base md:text-sm cursor-text"
                />
            )}
            {showError && errorMessage && (
                <div className="flex items-center gap-1 text-red-500 text-sm">
                    <AlertCircle className="h-3 w-3" />
                    <p>{errorMessage}</p>
                </div>
            )}
        </>
    );
}
