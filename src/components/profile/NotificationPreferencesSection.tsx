'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Bell, MapPin, Edit, Trash2, Loader2, Mail, Phone, MoreVertical, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Combobox from '@/components/Combobox';
import { CityMinimalWithCounts } from '@/lib/db/cities';
import { CityComboboxItem } from '@/components/cities/CityComboboxItem';
import { Link } from '@/i18n/routing';
import { formatNumericDate, formatNumericDateTime } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';
import { NotisSwitch } from '@/components/profile/NotisSwitch';
import { ErrorLine } from '@/components/ui/error-line';
import { SettingsBody, SettingsCard } from '@/components/profile/SettingsChrome';

interface CitySelectorProps {
    label: string;
    cities: CityMinimalWithCounts[];
    loading: boolean;
    onFetchCities: () => void;
    onSelect: (city: CityMinimalWithCounts | null) => void;
    placeholder: string;
    searchPlaceholder: string;
    emptyMessage: string;
    groupAvailableLabel: string;
    groupUnavailableLabel: string;
}

function CitySelector({
    label,
    cities,
    loading,
    onFetchCities,
    onSelect,
    placeholder,
    searchPlaceholder,
    emptyMessage,
    groupAvailableLabel,
    groupUnavailableLabel,
}: CitySelectorProps) {
    // Every municipality we know about is in this list, but only a small part of
    // them can send notifications; the rest lead to the petition page. One flat
    // run of ~375 rows buries the handful this control can subscribe you to.
    const groups = useMemo(() => [
        {
            key: 'available',
            label: groupAvailableLabel,
            items: cities.filter(city => city.supportsNotifications),
        },
        {
            key: 'unavailable',
            label: groupUnavailableLabel,
            items: cities.filter(city => !city.supportsNotifications),
        },
    ], [cities, groupAvailableLabel, groupUnavailableLabel]);

    return (
        <div className="w-full sm:w-fit">
            <Combobox
                items={cities}
                groups={groups}
                value={null}
                onChange={onSelect}
                placeholder={placeholder}
                searchPlaceholder={searchPlaceholder}
                getItemLabel={(city) => city.name}
                getItemValue={(city) => `${city.name} ${city.name_municipality}`}
                ItemComponent={CityComboboxItem}
                emptyMessage={emptyMessage}
                loading={loading}
                className="w-80"
                TriggerComponent={() => (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-full justify-start gap-2 sm:h-9 sm:w-auto"
                        onClick={onFetchCities}
                    >
                        <Plus className="h-4 w-4" aria-hidden />
                        {label}
                    </Button>
                )}
            />
        </div>
    );
}

interface NotificationPreference {
    id: string;
    cityId: string;
    updatedAt: string;
    city: {
        id: string;
        name: string;
        name_municipality: string;
    };
    notifyByEmail: boolean;
    locations: Array<{
        id: string;
        text: string;
    }>;
    interests: Array<{
        id: string;
        name: string;
        colorHex: string;
    }>;
}

interface PastNotification {
    id: string;
    type: string;
    createdAt: string;
    cityId: string;
    city: {
        name: string;
        name_municipality: string;
    };
    meeting: {
        id: string;
        name: string;
        dateTime: string;
    };
    subjects: Array<{
        subject: {
            name: string;
        };
    }>;
    deliveries: Array<{
        status: string;
        medium: string;
    }>;
}

type DeleteErrorKey = 'deleteError' | 'deleteNetworkError';

const DELIVERY_TONES = {
    sent: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    pending: 'bg-amber-50 text-amber-700',
} as const;

function isBadgedStatus(status: string): status is keyof typeof DELIVERY_TONES {
    return Object.prototype.hasOwnProperty.call(DELIVERY_TONES, status);
}

/**
 * One delivery of a past notification: the channel's glyph and how it went.
 * A delivery Notis took over (`skipped`) never went out on this channel, so
 * it gets no badge rather than a wrong one.
 */
function Delivery({ medium, status, labels }: {
    medium: 'email' | 'message';
    status: string;
    labels: Record<keyof typeof DELIVERY_TONES, string>;
}) {
    if (!isBadgedStatus(status)) return null;
    const Icon = medium === 'email' ? Mail : Phone;
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', DELIVERY_TONES[status])}>
            <Icon className="h-3 w-3" aria-hidden />
            {labels[status]}
        </span>
    );
}

export function NotificationPreferencesSection() {
    const t = useTranslations('NotificationPreferences');
    const locale = useLocale();
    const router = useRouter();
    const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
    const [notifications, setNotifications] = useState<PastNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<NotificationPreference | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<DeleteErrorKey | null>(null);
    const [cities, setCities] = useState<CityMinimalWithCounts[]>([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    useEffect(() => {
        fetchPreferences();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (historyOpen) {
            fetchAllNotifications();
        }
    }, [historyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchPreferences = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/user/notification-preferences');
            if (res.ok) {
                const data = await res.json();
                const prefs: NotificationPreference[] = data.preferences || [];
                setPreferences(prefs);
            }
        } catch (error) {
            console.error('Error fetching preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllNotifications = async () => {
        setLoadingNotifications(true);
        try {
            const res = await fetch('/api/user/notifications');
            if (res.ok) {
                const data = await res.json();
                const sorted = (data.notifications || []).sort(
                    (a: PastNotification, b: PastNotification) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setNotifications(sorted);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoadingNotifications(false);
        }
    };

    // The delete asks first, in a dialog rather than the browser's confirm,
    // and a refusal is a line under the list rather than an alert.
    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/user/notification-preferences/${pendingDelete.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                fetchPreferences();
            } else {
                setDeleteError('deleteError');
            }
        } catch (error) {
            console.error('Error deleting preference:', error);
            setDeleteError('deleteNetworkError');
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    };

    const fetchCitiesIfNeeded = async () => {
        if (cities.length > 0) return;
        setLoadingCities(true);
        try {
            const res = await fetch('/api/cities/all');
            if (res.ok) {
                setCities(await res.json());
            }
        } catch (error) {
            console.error('Error fetching cities:', error);
        } finally {
            setLoadingCities(false);
        }
    };

    // Email is the only per-city channel left: WhatsApp is one switch for the
    // whole account (NotisSwitch), because Νότης is one conversation.
    const updateChannels = async (
        preferenceId: string,
        changes: Pick<NotificationPreference, 'notifyByEmail'>,
    ) => {
        const previous = preferences.find(p => p.id === preferenceId);
        setPreferences(prev =>
            prev.map(p => p.id === preferenceId ? { ...p, ...changes } : p)
        );
        try {
            const res = await fetch(`/api/user/notification-preferences/${preferenceId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const updated = await res.json();
            setPreferences(prev =>
                prev.map(p => p.id === preferenceId ? { ...p, updatedAt: updated.updatedAt } : p)
            );
        } catch (error) {
            console.error('Error updating notification channel:', error);
            if (previous) {
                setPreferences(prev =>
                    prev.map(p => p.id === preferenceId
                        ? { ...p, notifyByEmail: previous.notifyByEmail }
                        : p)
                );
            }
        }
    };

    const citySelectorProps = {
        cities,
        loading: loadingCities,
        onFetchCities: fetchCitiesIfNeeded,
        onSelect: (city: CityMinimalWithCounts | null) => {
            if (city) router.push(`/${city.id}/notifications`);
        },
        placeholder: t('selectCityPlaceholder'),
        searchPlaceholder: t('searchCityPlaceholder'),
        emptyMessage: t('cityNotFound'),
        groupAvailableLabel: t('groupAvailable'),
        groupUnavailableLabel: t('groupUnavailable'),
    };

    if (loading) {
        return (
            <SettingsCard>
                <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                </div>
            </SettingsCard>
        );
    }

    if (preferences.length === 0) {
        return (
            <div className="flex flex-col gap-4">
                <NotisSwitch hasPreferences={false} />
                <SettingsCard>
                    <SettingsBody className="flex flex-col items-start gap-4 py-6 sm:py-8">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--orange))]/[0.10] text-[hsl(var(--orange-deep))]" aria-hidden>
                            <Bell className="h-5 w-5" />
                        </span>
                        <div className="flex flex-col gap-1.5">
                            <p className="max-w-md text-[15px] leading-[1.5]">{t('noPreferencesDescription')}</p>
                            <p className="max-w-md text-[13px] leading-[1.45] text-muted-foreground">{t('sendTiming')}</p>
                        </div>
                        <CitySelector label={t('selectCityButton')} {...citySelectorProps} />
                    </SettingsBody>
                </SettingsCard>
            </div>
        );
    }

    const allDisabled = preferences.every(p => !p.notifyByEmail);

    const disableAll = async () => {
        const toDisable = preferences.filter(p => p.notifyByEmail);
        if (toDisable.length === 0) return;
        await Promise.all(
            toDisable.map(p => updateChannels(p.id, { notifyByEmail: false }))
        );
    };

    const enableAll = async () => {
        const toEnable = preferences.filter(p => !p.notifyByEmail);
        if (toEnable.length === 0) return;
        await Promise.all(
            toEnable.map(p => updateChannels(p.id, { notifyByEmail: true }))
        );
    };

    const deliveryLabels = { sent: t('statusSent'), failed: t('statusFailed'), pending: t('statusPending') };
    const lastUpdated = new Date(Math.max(...preferences.map(p => new Date(p.updatedAt).getTime())));

    return (
        <div className="flex flex-col gap-4">
            <NotisSwitch hasPreferences />

            <SettingsCard
                title={t('preferencesTitle')}
                description={t('sendTiming')}
                action={
                    <Button variant="ghost" size="sm" className="-mr-2 -mt-1.5 text-[13px]" onClick={allDisabled ? enableAll : disableAll}>
                        {allDisabled ? t('enableAll') : t('disableAll')}
                    </Button>
                }
            >
                <ul className="mt-4 divide-y divide-border border-t border-border">
                    {preferences.map(pref => (
                        <li key={pref.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-medium leading-snug">{pref.city.name_municipality}</p>
                                {(pref.interests.length > 0 || pref.locations.length > 0) && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] leading-snug text-muted-foreground">
                                        {pref.interests.map(topic => (
                                            <span key={topic.id} className="inline-flex items-center gap-1.5">
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: topic.colorHex }} aria-hidden />
                                                {topic.name}
                                            </span>
                                        ))}
                                        {pref.locations.map(loc => (
                                            <span key={loc.id} className="inline-flex items-center gap-1">
                                                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                                {loc.text}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5" aria-hidden />
                                        {t('notifyByEmail')}
                                    </span>
                                    <Switch
                                        checked={pref.notifyByEmail}
                                        onCheckedChange={(checked) =>
                                            updateChannels(pref.id, { notifyByEmail: checked })
                                        }
                                    />
                                </label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:bg-foreground/[0.06]" aria-label={t('actions')}>
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild>
                                            <Link href={`/${pref.cityId}/notifications`} className="flex cursor-pointer items-center gap-2">
                                                <Edit className="h-3.5 w-3.5" aria-hidden />
                                                {t('editOptions')}
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                                            onClick={() => setPendingDelete(pref)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                            {t('delete')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </li>
                    ))}
                </ul>
                {deleteError && (
                    <div className="border-t border-border px-4 py-3 sm:px-5">
                        <ErrorLine>{t(deleteError)}</ErrorLine>
                    </div>
                )}
                <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <CitySelector label={t('addCity')} {...citySelectorProps} />
                    <p className="text-xs text-muted-foreground">
                        {t('lastUpdated', { date: formatNumericDateTime(lastUpdated, undefined, locale, false) })}
                    </p>
                </div>
            </SettingsCard>

            <SettingsCard>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-4 text-left transition-colors hover:bg-foreground/[0.02] sm:px-5"
                    onClick={() => setHistoryOpen(prev => !prev)}
                    aria-expanded={historyOpen}
                >
                    <span className="text-[15px] font-semibold leading-snug">
                        {t('historyTitle')}
                        {historyOpen && !loadingNotifications && (
                            <span className="font-normal text-muted-foreground"> ({notifications.length})</span>
                        )}
                    </span>
                    <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', !historyOpen && '-rotate-90')} aria-hidden />
                </button>
                {historyOpen && (loadingNotifications ? (
                    <div className="flex justify-center border-t border-border py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                    </div>
                ) : notifications.length === 0 ? (
                    <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground sm:px-5">
                        {t('noNotifications')}
                    </p>
                ) : (
                    <ul className="divide-y divide-border border-t border-border">
                        {notifications.map(notification => {
                            const emailDelivery = notification.deliveries.find(d => d.medium === 'email');
                            const messageDelivery = notification.deliveries.find(d => d.medium === 'message');
                            return (
                                <li key={notification.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-medium leading-snug">{notification.city.name_municipality}</p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {formatNumericDate(new Date(notification.createdAt), undefined, locale)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                        {emailDelivery && <Delivery medium="email" status={emailDelivery.status} labels={deliveryLabels} />}
                                        {messageDelivery && <Delivery medium="message" status={messageDelivery.status} labels={deliveryLabels} />}
                                    </div>
                                    <Link
                                        href={`/notifications/${notification.id}`}
                                        target="_blank"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground hover:no-underline"
                                        aria-label={t('viewNotification')}
                                        title={t('viewNotification')}
                                    >
                                        <ExternalLink className="h-4 w-4" aria-hidden />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                ))}
            </SettingsCard>

            <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
                <DialogContent align="start">
                    <DialogHeader>
                        <DialogTitle>{t('delete')}</DialogTitle>
                        <DialogDescription>
                            {pendingDelete && t('deleteConfirm', { cityName: pendingDelete.city.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-3">
                        <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
                            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                            {t('delete')}
                        </Button>
                        <DialogClose asChild>
                            <Button variant="outline">{t('cancel')}</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
