"use client";

import { useEffect, useState, type ComponentProps } from 'react';
import { PhoneField as SharedPhoneField } from '../../../packages/ui/src/phone-field';
import { REALMS } from '@/lib/realm';
import { realmForBrowser } from '@/lib/realm.client';

export type { PhoneFieldValidity } from '../../../packages/ui/src/phone-field';

/** App boundary: the shared UI package does not need to know about realms. */
export function PhoneField(props: ComponentProps<typeof SharedPhoneField>) {
    const [country, setCountry] = useState('gr');
    useEffect(() => {
        setCountry(REALMS[realmForBrowser()].country.toLowerCase());
    }, []);
    return <SharedPhoneField {...props} defaultCountry={props.defaultCountry ?? country} />;
}
