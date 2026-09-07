'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/routing';
import { getNotisChannelState, setNotisEnabled, type NotisChannelState } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';
import { maskPhone } from '@/components/signup/signup-shared';
import { notisStatusFromChannelState, phoneChannelFor } from '@/lib/notis/phone-channel';

/**
 * One switch for the WhatsApp channel, backed by the Notis subscriptions
 * API. Notis owns the status, so the switch shows what Notis says and falls
 * back to the reader's own request only while Notis has not enrolled them
 * yet. A flip Notis does not confirm changes nothing: the switch stays
 * where it was and offers to try again. Notis unreachable never shows as
 * OFF either: the switch freezes on its last known state and says so.
 */

type Loaded = {
    state: NotisChannelState;
    enabled: boolean;
    error: string | null;
    /** The state the reader asked for and Notis did not confirm; offered again. */
    retry: boolean | null;
};

export function NotisSwitch({ hasPreferences }: { hasPreferences: boolean }) {
    const t = useTranslations('NotificationPreferences');
    const tp = useTranslations('Profile');
    const id = useId();
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoadFailed(false);
        try {
            const state = await getNotisChannelState();
            // No state means no session, which on this page means it expired.
            // Either way the row must not sit on a spinner for good.
            if (!state) {
                setLoadFailed(true);
                return;
            }
            setLoaded({
                state,
                enabled: phoneChannelFor(notisStatusFromChannelState(state), state.notifyByPhone) ?? state.notifyByPhone,
                error: null,
                retry: null,
            });
        } catch (error) {
            console.error('Notis state failed to load:', error);
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const flip = async (next: boolean) => {
        if (!loaded) return;
        setSaving(true);
        try {
            const result = await setNotisEnabled(next);
            if (!result.ok) {
                setLoaded({ ...loaded, error: result.code, retry: result.code === 'notis_unreachable' ? next : null });
                return;
            }
            captureEvent('notis_toggle_changed', {
                enabled: result.enabled,
                had_subscription: loaded.state.subscription !== null,
            });
            setLoaded({
                state: { ...loaded.state, notifyByPhone: result.enabled, subscription: result.subscription },
                enabled: result.enabled,
                error: null,
                retry: null,
            });
        } catch (error) {
            // A thrown action must not leave the switch disabled for good.
            console.error('Notis switch failed:', error);
            setLoaded({ ...loaded, error: 'exception', retry: null });
        } finally {
            setSaving(false);
        }
    };

    // A reader with no preference rows has nothing for Νότης to say, unless
    // he already knows them; then the switch is how they turn him off.
    if (!hasPreferences && !loaded?.state.subscription) return null;

    // One line for the one condition, whether it stopped a read or a flip.
    // Disabled while saving: a second click would race the first over the same
    // captured state, and the later answer would win.
    const unreachableLine = (onRetry: () => void) => (
        <>
            {t('notisUnreachable')}{' '}
            <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60"
                disabled={saving}
                onClick={onRetry}
            >
                {t('notisRetry')}
            </button>
        </>
    );

    let status: React.ReactNode = null;
    let tone = 'text-muted-foreground';
    if (!loaded && loadFailed) {
        status = unreachableLine(load);
    } else if (loaded) {
        const { state, enabled, error, retry } = loaded;
        const phone = state.phone ? maskPhone(state.phone) : '';
        if (error === 'notis_unreachable' && retry !== null) {
            tone = 'text-amber-700';
            status = unreachableLine(() => flip(retry));
        } else if (error) {
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
            status = unreachableLine(load);
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
