'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/routing';
import { getNotisChannelState, setNotisEnabled, type NotisChannelState } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';
import { maskPhone } from '@/components/notifications/signup/signup-state';

/**
 * One switch for the WhatsApp channel, backed by the Notis subscriptions
 * API. Notis owns the status, so the switch reads it from there and falls
 * back to the reader's notifyByPhone flags only while Notis has not
 * enrolled them yet. Notis unreachable never shows as OFF: the switch
 * freezes on its last known state and says so.
 */

type Loaded = {
    state: NotisChannelState;
    enabled: boolean;
    /** The last flip wrote the flags but did not reach Notis. */
    unsynced: boolean;
    error: string | null;
};

export function NotisSwitch({ hasPreferences }: { hasPreferences: boolean }) {
    const t = useTranslations('NotificationPreferences');
    const tp = useTranslations('Profile');
    const id = useId();
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const state = await getNotisChannelState();
        if (!state) return;
        setLoaded({
            state,
            enabled: state.subscription ? state.subscription.status === 'active' : state.notifyByPhoneAny,
            unsynced: false,
            error: null,
        });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const flip = async (next: boolean) => {
        if (!loaded) return;
        setSaving(true);
        const result = await setNotisEnabled(next);
        setSaving(false);
        if (!result.ok) {
            setLoaded({ ...loaded, error: result.code });
            return;
        }
        captureEvent('notis_toggle_changed', {
            enabled: result.enabled,
            synced: result.synced,
            had_subscription: loaded.state.subscription !== null,
        });
        setLoaded({
            state: {
                ...loaded.state,
                notifyByPhoneAny: result.enabled,
                subscription: result.synced ? result.subscription : loaded.state.subscription,
            },
            enabled: result.enabled,
            unsynced: !result.synced,
            error: null,
        });
    };

    // A reader with no preference rows has nothing for Νότης to say, unless
    // he already knows them; then the switch is how they turn him off.
    if (!hasPreferences && !loaded?.state.subscription) return null;

    const retry = (
        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => flip(loaded!.enabled)}>
            {t('notisRetry')}
        </button>
    );

    let status: React.ReactNode = null;
    let tone = 'text-muted-foreground';
    if (loaded) {
        const { state, enabled, unsynced, error } = loaded;
        const phone = state.phone ? maskPhone(state.phone) : '';
        if (error) {
            tone = 'text-destructive';
            status = errorMessage(error, t, tp);
        } else if (!state.phone) {
            status = (
                <>
                    {t('notisNoPhone')}{' '}
                    <Link href="/profile?tab=personal" className="underline underline-offset-2 hover:text-foreground">
                        {t('notisAddPhone')}
                    </Link>
                </>
            );
        } else if (!state.reachable) {
            status = (
                <>
                    {t('notisUnreachable')}{' '}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={load}>
                        {t('notisRetry')}
                    </button>
                </>
            );
        } else if (unsynced) {
            tone = 'text-amber-700';
            status = <>{t('notisUnsynced')} {retry}</>;
        } else if (enabled && state.subscription?.status === 'active') {
            status = t('notisOn', { phone });
        } else if (enabled) {
            status = t('notisPending', { phone });
        } else {
            status = t('notisOff');
        }
    }

    const disabled = !loaded || saving || !loaded.state.phone || !loaded.state.reachable;

    return (
        <div className="flex items-start gap-3 rounded-lg border p-4">
            <Image
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full bg-muted object-contain p-0.5"
            />
            <div className="min-w-0 flex-1">
                <label htmlFor={id} className="block font-semibold leading-tight">
                    {t('notisTitle')}
                </label>
                {status && (
                    <p id={`${id}-status`} className={`mt-1 text-sm ${tone}`}>
                        {status}
                    </p>
                )}
            </div>
            {loaded ? (
                <Switch
                    id={id}
                    checked={loaded.enabled}
                    disabled={disabled}
                    onCheckedChange={flip}
                    aria-describedby={status ? `${id}-status` : undefined}
                />
            ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            )}
        </div>
    );
}

function errorMessage(
    code: string,
    t: ReturnType<typeof useTranslations<'NotificationPreferences'>>,
    tp: ReturnType<typeof useTranslations<'Profile'>>,
): string {
    switch (code) {
        case 'no_phone':
        case 'phone_empty':
            return t('notisNoPhone');
        case 'phone_in_use':
            return tp('phoneInUse');
        case 'phone_not_mobile':
            return tp('phoneNotMobile');
        case 'phone_invalid':
            return tp('phoneInvalid');
        default:
            return t('notisError');
    }
}
