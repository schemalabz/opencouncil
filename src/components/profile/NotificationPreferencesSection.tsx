'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, MapPin, Tag, Edit, Trash2, Loader2, Mail, Phone, MoreVertical, ChevronDown, ExternalLink } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Combobox from '@/components/Combobox';
import { CityMinimalWithCounts } from '@/lib/db/cities';
import { Link } from '@/i18n/routing';
import { format } from 'date-fns';
import { getDateFnsLocale } from '@/lib/formatters/time';

interface CitySelectorProps {
    label: string;
    size?: 'default' | 'sm';
    cities: CityMinimalWithCounts[];
    loading: boolean;
    onFetchCities: () => void;
    onSelect: (city: CityMinimalWithCounts | null) => void;
    placeholder: string;
    searchPlaceholder: string;
    emptyMessage: string;
}

function CitySelector({
    label,
    size = 'default',
    cities,
    loading,
    onFetchCities,
    onSelect,
    placeholder,
    searchPlaceholder,
    emptyMessage,
}: CitySelectorProps) {
    return (
        <div className="w-fit">
            <Combobox
                items={cities}
                value={null}
                onChange={onSelect}
                placeholder={placeholder}
                searchPlaceholder={searchPlaceholder}
                getItemLabel={(city) => city.name}
                getItemValue={(city) => `${city.name} ${city.name_municipality}`}
                emptyMessage={emptyMessage}
                loading={loading}
                className="w-64"
                TriggerComponent={() => (
                    <Button variant="outline" size={size} onClick={onFetchCities}>
                        <Bell className="mr-2 h-4 w-4" />
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
    notifyByPhone: boolean;
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

export function NotificationPreferencesSection() {
    const t = useTranslations('NotificationPreferences');
    const dateLocale = getDateFnsLocale(useLocale());
    const router = useRouter();
    const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
    const [notifications, setNotifications] = useState<PastNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
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

    const deletePreference = async (preferenceId: string, cityName: string) => {
        if (!confirm(t('deleteConfirm', { cityName }))) return;

        setDeleting(preferenceId);
        try {
            const res = await fetch(`/api/user/notification-preferences/${preferenceId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                fetchPreferences();
            } else {
                alert(t('deleteError'));
            }
        } catch (error) {
            console.error('Error deleting preference:', error);
            alert(t('deleteNetworkError'));
        } finally {
            setDeleting(null);
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

    const updateChannels = async (
        preferenceId: string,
        changes: Partial<Pick<NotificationPreference, 'notifyByEmail' | 'notifyByPhone'>>,
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
                        ? { ...p, notifyByEmail: previous.notifyByEmail, notifyByPhone: previous.notifyByPhone }
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
    };

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (preferences.length === 0) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    {t('noPreferencesDescription')}
                </p>
                <CitySelector label={t('selectCityButton')} {...citySelectorProps} />
            </div>
        );
    }

    const allDisabled = preferences.every(p => !p.notifyByEmail && !p.notifyByPhone);

    const disableAll = async () => {
        const toDisable = preferences.filter(p => p.notifyByEmail || p.notifyByPhone);
        if (toDisable.length === 0) return;
        await Promise.all(
            toDisable.map(p => updateChannels(p.id, { notifyByEmail: false, notifyByPhone: false }))
        );
    };

    const enableAll = async () => {
        const toEnable = preferences.filter(p => !p.notifyByEmail || !p.notifyByPhone);
        if (toEnable.length === 0) return;
        await Promise.all(
            toEnable.map(p => updateChannels(p.id, { notifyByEmail: true, notifyByPhone: true }))
        );
    };

    return (
        <div className="space-y-8">
            {/* Preferences table */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between gap-2">
                    <h3 className="font-semibold">{t('preferencesTitle')}</h3>
                    <Button variant="outline" size="sm" onClick={allDisabled ? enableAll : disableAll}>
                        {allDisabled ? t('enableAll') : t('disableAll')}
                    </Button>
                </div>
                {/* Mobile: stacked cards */}
                <div className="sm:hidden space-y-2">
                    {preferences.map(pref => (
                        <div key={pref.id} className="rounded-md border p-3 space-y-2">
                            <div className="space-y-1.5">
                                <p className="font-medium">{pref.city.name_municipality}</p>
                                {pref.interests.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="text-xs text-muted-foreground">{t('topics')}</span>
                                        {pref.interests.map(topic => (
                                            <Badge
                                                key={topic.id}
                                                className="text-xs"
                                                style={{ backgroundColor: topic.colorHex, color: 'white' }}
                                            >
                                                <Tag className="h-3 w-3 mr-1" />
                                                {topic.name}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {pref.locations.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="text-xs text-muted-foreground">{t('locations')}</span>
                                        {pref.locations.map(loc => (
                                            <span key={loc.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                <MapPin className="h-3 w-3" />
                                                {loc.text}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col justify-between pt-1 gap-5">
                                <div className="flex flex-col gap-4">
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                        <Checkbox
                                            checked={pref.notifyByEmail}
                                            onCheckedChange={(checked) =>
                                                updateChannels(pref.id, { notifyByEmail: checked as boolean })
                                            }
                                        />
                                        <Mail className="h-3 w-3" /> {t('notifyByEmail')}
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                        <Checkbox
                                            checked={pref.notifyByPhone}
                                            onCheckedChange={(checked) =>
                                                updateChannels(pref.id, { notifyByPhone: checked as boolean })
                                            }
                                        />
                                        <Phone className="h-3 w-3" /> {t('notifyBySms')}
                                    </label>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1 bg-gray-100">
                                            {t('actions')} <ChevronDown className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild>
                                            <Link href={`/${pref.cityId}/notifications`} className="flex items-center gap-2">
                                                <Edit className="h-3 w-3" />
                                                {t('edit')}
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive flex items-center gap-2"
                                            disabled={deleting === pref.id}
                                            onClick={() => deletePreference(pref.id, pref.city.name)}
                                        >
                                            {deleting === pref.id
                                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                                : <Trash2 className="h-3 w-3" />
                                            }
                                            {t('delete')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop: table */}
                <div className="space-y-2">
                    <div className="hidden sm:block rounded-md border">
                        <Table className="table-auto">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('municipality')}</TableHead>
                                    <TableHead className="text-center w-16">
                                        <span className="flex items-center justify-center gap-1">{t('notifyByEmail')}</span>
                                    </TableHead>
                                    <TableHead className="text-center w-20">
                                        <span className="flex items-center justify-center gap-1">{t('notifyBySms')}</span>
                                    </TableHead>
                                    <TableHead className="text-center w-20">
                                        <span className="flex items-center justify-center gap-1">{t('actions')}</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preferences.map(pref => (
                                    <TableRow key={pref.id}>
                                        <TableCell>
                                            <div className="space-y-1.5">
                                                <p className="font-medium">{pref.city.name_municipality}</p>
                                                {pref.interests.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <span className="text-xs text-muted-foreground">{t('topics')}</span>
                                                        {pref.interests.map(topic => (
                                                            <Badge
                                                                key={topic.id}
                                                                className="text-xs"
                                                                style={{ backgroundColor: topic.colorHex, color: 'white' }}
                                                            >
                                                                <Tag className="h-3 w-3 mr-1" />
                                                                {topic.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                                {pref.locations.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <span className="text-xs text-muted-foreground">{t('locations')}</span>
                                                        {pref.locations.map(loc => (
                                                            <span key={loc.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                <MapPin className="h-3 w-3" />
                                                                {loc.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Checkbox
                                                checked={pref.notifyByEmail}
                                                onCheckedChange={(checked) =>
                                                    updateChannels(pref.id, { notifyByEmail: checked as boolean })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Checkbox
                                                checked={pref.notifyByPhone}
                                                onCheckedChange={(checked) =>
                                                    updateChannels(pref.id, { notifyByPhone: checked as boolean })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/${pref.cityId}/notifications`} className="flex items-center gap-2">
                                                            <Edit className="h-3 w-3" />
                                                            {t('editOptions')}
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive flex items-center gap-2"
                                                        disabled={deleting === pref.id}
                                                        onClick={() => deletePreference(pref.id, pref.city.name)}
                                                    >
                                                        {deleting === pref.id
                                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                                            : <Trash2 className="h-3 w-3" />
                                                        }
                                                        {t('delete')}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {preferences.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {t('lastUpdated', { date: format(new Date(Math.max(...preferences.map(p => new Date(p.updatedAt).getTime()))), 'dd/MM/yyyy HH:mm', { locale: dateLocale }) })}
                        </p>
                    )}
                </div>

                <CitySelector label={t('addCity')} size="sm" {...citySelectorProps} />
            </div>

            {/* Notifications history table */}
            <div className="space-y-4">
                <button
                    className="flex items-center gap-2 w-full text-left"
                    onClick={() => setHistoryOpen(prev => !prev)}
                >
                    <h3 className="font-semibold">
                        {t('historyTitle')}
                        {historyOpen && !loadingNotifications && (
                            <span className="text-muted-foreground font-normal"> ({notifications.length})</span>
                        )}
                    </h3>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${historyOpen ? '' : '-rotate-90'}`} />
                </button>
                {historyOpen && (loadingNotifications ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                ) : notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        {t('noNotifications')}
                    </p>
                ) : (
                    <>
                        {/* Mobile: 2-column table */}
                        <div className="sm:hidden rounded-md border">
                            <Table className="table-auto">
                                <TableBody>
                                    {notifications.map(notification => {
                                        const emailDelivery = notification.deliveries.find(d => d.medium === 'email');
                                        const messageDelivery = notification.deliveries.find(d => d.medium === 'message');

                                        return (
                                            <TableRow key={notification.id}>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <p className="font-medium">{notification.city.name_municipality}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {t('dateLabel')} {format(new Date(notification.createdAt), 'dd/MM/yyyy', { locale: dateLocale })}
                                                        </p>
                                                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                            {emailDelivery && (
                                                                <div className="flex items-center gap-1">
                                                                    <Mail className="h-3 w-3" />
                                                                    {emailDelivery.status === 'sent' && <Badge className="bg-green-100 text-green-800 text-xs hover:bg-green-200">{t('statusSent')}</Badge>}
                                                                    {emailDelivery.status === 'failed' && <Badge className="bg-red-100 text-red-800 text-xs hover:bg-red-200">{t('statusFailed')}</Badge>}
                                                                    {emailDelivery.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-800 text-xs hover:bg-yellow-200">{t('statusPending')}</Badge>}
                                                                </div>
                                                            )}
                                                            {messageDelivery && (
                                                                <div className="flex items-center gap-1">
                                                                    <Phone className="h-3 w-3" />
                                                                    {messageDelivery.status === 'sent' && <Badge className="bg-green-100 text-green-800 text-xs hover:bg-green-200">{t('statusSent')}</Badge>}
                                                                    {messageDelivery.status === 'failed' && <Badge className="bg-red-100 text-red-800 text-xs hover:bg-red-200">{t('statusFailed')}</Badge>}
                                                                    {messageDelivery.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-800 text-xs hover:bg-yellow-200">{t('statusPending')}</Badge>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right w-10">
                                                    <Link href={`/notifications/${notification.id}`} target="_blank">
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Desktop: 4-column table */}
                        <div className="hidden sm:block rounded-md border">
                            <Table className="table-auto">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('municipality')}</TableHead>
                                        <TableHead className="w-24">{t('status')}</TableHead>
                                        <TableHead className="w-24">{t('date')}</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {notifications.map(notification => {
                                        const emailDelivery = notification.deliveries.find(d => d.medium === 'email');
                                        const messageDelivery = notification.deliveries.find(d => d.medium === 'message');

                                        return (
                                            <TableRow key={notification.id}>
                                                <TableCell className="font-medium">
                                                    {notification.city.name_municipality}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        {emailDelivery && (
                                                            <div className="flex items-center gap-1">
                                                                <Mail className="h-3 w-3 text-muted-foreground" />
                                                                {emailDelivery.status === 'sent' && <Badge className="bg-green-100 text-green-800 text-xs hover:bg-green-200">{t('statusSent')}</Badge>}
                                                                {emailDelivery.status === 'failed' && <Badge className="bg-red-100 text-red-800 text-xs hover:bg-red-200">{t('statusFailed')}</Badge>}
                                                                {emailDelivery.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-800 text-xs hover:bg-yellow-200">{t('statusPending')}</Badge>}
                                                            </div>
                                                        )}
                                                        {messageDelivery && (
                                                            <div className="flex items-center gap-1">
                                                                <Phone className="h-3 w-3 text-muted-foreground" />
                                                                {messageDelivery.status === 'sent' && <Badge className="bg-green-100 text-green-800 text-xs hover:bg-green-200">{t('statusSent')}</Badge>}
                                                                {messageDelivery.status === 'failed' && <Badge className="bg-red-100 text-red-800 text-xs hover:bg-red-200">{t('statusFailed')}</Badge>}
                                                                {messageDelivery.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-800 text-xs hover:bg-yellow-200">{t('statusPending')}</Badge>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                    {format(new Date(notification.createdAt), 'dd/MM/yyyy', { locale: dateLocale })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Link className="text-xs flex items-center gap-2" href={`/notifications/${notification.id}`} target="_blank">
                                                        {t('viewNotification')}
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                ))}
            </div>
        </div>
    );
}
