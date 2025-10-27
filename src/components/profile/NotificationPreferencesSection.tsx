'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, MapPin, Tag, Edit, Trash2, ChevronDown, ChevronUp, Calendar, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Link from 'next/link';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';

interface NotificationPreference {
    id: string;
    cityId: string;
    city: {
        id: string;
        name: string;
        name_municipality: string;
    };
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
    const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
    const [pastNotifications, setPastNotifications] = useState<Record<string, PastNotification[]>>({});
    const [loading, setLoading] = useState(true);
    const [loadingNotifications, setLoadingNotifications] = useState<Set<string>>(new Set());
    const [expandedPreferences, setExpandedPreferences] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/user/notification-preferences');
            if (res.ok) {
                const data = await res.json();
                setPreferences(data.preferences || []);
            }
        } catch (error) {
            console.error('Error fetching preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchNotificationsForCity = async (cityId: string) => {
        if (pastNotifications[cityId]) return; // Already loaded

        setLoadingNotifications(prev => new Set(prev).add(cityId));
        try {
            const res = await fetch(`/api/user/notifications?cityId=${cityId}`);
            if (res.ok) {
                const data = await res.json();
                setPastNotifications(prev => ({
                    ...prev,
                    [cityId]: data.notifications || []
                }));
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoadingNotifications(prev => {
                const newSet = new Set(prev);
                newSet.delete(cityId);
                return newSet;
            });
        }
    };

    const togglePreference = (preferenceId: string, cityId: string) => {
        setExpandedPreferences(prev => {
            const newSet = new Set(prev);
            if (newSet.has(preferenceId)) {
                newSet.delete(preferenceId);
            } else {
                newSet.add(preferenceId);
                // Load notifications when expanding
                fetchNotificationsForCity(cityId);
            }
            return newSet;
        });
    };

    const deletePreference = async (preferenceId: string, cityName: string) => {
        if (!confirm(`Θέλετε σίγουρα να διαγράψετε τις ειδοποιήσεις για ${cityName};`)) {
            return;
        }

        setDeleting(preferenceId);
        try {
            const res = await fetch(`/api/user/notification-preferences/${preferenceId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                alert('Οι προτιμήσεις ειδοποιήσεων διαγράφηκαν επιτυχώς');
                fetchPreferences();
            } else {
                alert('Αποτυχία διαγραφής προτιμήσεων');
            }
        } catch (error) {
            console.error('Error deleting preference:', error);
            alert('Σφάλμα κατά τη διαγραφή');
        } finally {
            setDeleting(null);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </CardContent>
            </Card>
        );
    }

    if (preferences.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Ειδοποιήσεις
                    </CardTitle>
                    <CardDescription>
                        Δεν έχετε ενεργοποιήσει ειδοποιήσεις για κάποια πόλη
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 mb-4">
                        Εγγραφείτε για να λαμβάνετε ενημερώσεις για θέματα δημοτικών συνεδριάσεων που σας αφορούν.
                    </p>
                    <Link href="/">
                        <Button>
                            <Bell className="mr-2 h-4 w-4" />
                            Επιλέξτε Πόλη
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Ειδοποιήσεις
                </CardTitle>
                <CardDescription>
                    Διαχειριστείτε τις προτιμήσεις ειδοποιήσεων σας
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {preferences.map(pref => {
                    const isExpanded = expandedPreferences.has(pref.id);
                    const cityNotifications = pastNotifications[pref.cityId] || [];
                    const isLoadingNotifs = loadingNotifications.has(pref.cityId);

                    return (
                        <Collapsible
                            key={pref.id}
                            open={isExpanded}
                            onOpenChange={() => togglePreference(pref.id, pref.cityId)}
                        >
                            <div className="border rounded-lg">
                                <CollapsibleTrigger asChild>
                                    <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h4 className="font-semibold">{pref.city.name_municipality}</h4>
                                                    <Badge variant="outline">
                                                        {pref.locations.length} τοποθεσίες
                                                    </Badge>
                                                    <Badge variant="outline">
                                                        {pref.interests.length} θέματα
                                                    </Badge>
                                                </div>

                                                {/* Preview of locations and topics */}
                                                <div className="flex flex-wrap gap-2 text-sm">
                                                    {pref.locations.slice(0, 2).map(loc => (
                                                        <span key={loc.id} className="inline-flex items-center gap-1 text-gray-600">
                                                            <MapPin className="h-3 w-3" />
                                                            {loc.text}
                                                        </span>
                                                    ))}
                                                    {pref.locations.length > 2 && (
                                                        <span className="text-gray-500">+{pref.locations.length - 2} ακόμα</span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {pref.interests.slice(0, 3).map(topic => (
                                                        <Badge
                                                            key={topic.id}
                                                            style={{
                                                                backgroundColor: topic.colorHex,
                                                                color: 'white'
                                                            }}
                                                            className="text-xs"
                                                        >
                                                            <Tag className="h-3 w-3 mr-1" />
                                                            {topic.name}
                                                        </Badge>
                                                    ))}
                                                    {pref.interests.length > 3 && (
                                                        <span className="text-xs text-gray-500">+{pref.interests.length - 3} ακόμα</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 ml-4">
                                                <Link
                                                    href={`/${pref.cityId}/notifications`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Button variant="outline" size="sm" className="gap-1">
                                                        <Edit className="h-3 w-3" />
                                                        Επεξεργασία
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deletePreference(pref.id, pref.city.name);
                                                    }}
                                                    disabled={deleting === pref.id}
                                                    className="gap-1"
                                                >
                                                    {deleting === pref.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3 w-3" />
                                                    )}
                                                </Button>
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4 text-gray-500" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                    <div className="border-t p-4 bg-gray-50 space-y-3">
                                        <h5 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            Ιστορικό Ειδοποιήσεων
                                        </h5>

                                        {isLoadingNotifs ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                            </div>
                                        ) : cityNotifications.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">
                                                Δεν έχετε λάβει ειδοποιήσεις ακόμα
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {cityNotifications.map(notification => {
                                                    const allDeliveriesSent = notification.deliveries.every(d => d.status === 'sent');
                                                    const anyFailed = notification.deliveries.some(d => d.status === 'failed');

                                                    return (
                                                        <Link
                                                            key={notification.id}
                                                            href={`/notifications/${notification.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block"
                                                        >
                                                            <div className="p-3 bg-white rounded border hover:border-gray-400 transition-colors">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className="text-sm font-medium">
                                                                                {notification.meeting.name}
                                                                            </span>
                                                                            <Badge variant="outline" className="text-xs">
                                                                                {notification.type === 'beforeMeeting' ? 'Πριν' : 'Μετά'}
                                                                            </Badge>
                                                                            {allDeliveriesSent && (
                                                                                <Badge className="bg-green-100 text-green-800 text-xs">
                                                                                    Εστάλη
                                                                                </Badge>
                                                                            )}
                                                                            {anyFailed && (
                                                                                <Badge className="bg-red-100 text-red-800 text-xs">
                                                                                    Αποτυχία
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-gray-600">
                                                                            {notification.subjects.length} θέματα •
                                                                            {' '}{format(new Date(notification.meeting.dateTime), 'PPP', { locale: el })}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 mt-1">
                                                                            Δημιουργήθηκε {format(new Date(notification.createdAt), 'PPp', { locale: el })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </CollapsibleContent>
                            </div>
                        </Collapsible>
                    );
                })}

                <div className="pt-4 border-t">
                    <Link href="/">
                        <Button variant="outline" className="w-full">
                            <Bell className="mr-2 h-4 w-4" />
                            Προσθέστε Ειδοποιήσεις για Άλλη Πόλη
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

