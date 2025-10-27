import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Calendar, Building2, Tag, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import prisma from '@/lib/db/prisma';

async function getNotification(id: string) {
    try {
        const notification = await prisma.notification.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                city: true,
                meeting: {
                    include: {
                        administrativeBody: true
                    }
                },
                subjects: {
                    include: {
                        subject: {
                            include: {
                                topic: true,
                                location: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });

        if (!notification) {
            return null;
        }

        // Get location coordinates if subjects have locations
        const locationIds = notification.subjects
            .map(ns => ns.subject.locationId)
            .filter((id): id is string => id !== null);

        let locationCoordinates: Record<string, [number, number]> = {};

        if (locationIds.length > 0) {
            const coords = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds})
                AND type = 'point'
            `;

            locationCoordinates = coords.reduce((acc, loc) => {
                acc[loc.id] = [loc.x, loc.y];
                return acc;
            }, {} as Record<string, [number, number]>);
        }

        // Add coordinates to the response
        return {
            ...notification,
            subjects: notification.subjects.map(ns => ({
                ...ns,
                subject: {
                    ...ns.subject,
                    location: ns.subject.location ? {
                        ...ns.subject.location,
                        coordinates: ns.subject.locationId ? locationCoordinates[ns.subject.locationId] : null
                    } : null
                }
            }))
        };
    } catch (error) {
        console.error('Error fetching notification:', error);
        return null;
    }
}

function getReasonBadge(reason: string) {
    const badges = {
        proximity: { label: 'Κοντά σε εσάς', color: 'bg-blue-100 text-blue-800' },
        topic: { label: 'Θέμα ενδιαφέροντος', color: 'bg-purple-100 text-purple-800' },
        generalInterest: { label: 'Γενικού ενδιαφέροντος', color: 'bg-amber-100 text-amber-800' }
    };

    const badge = badges[reason as keyof typeof badges] || badges.generalInterest;

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.label}
        </span>
    );
}

export default async function NotificationPage({ params }: { params: { id: string } }) {
    const notification = await getNotification(params.id);

    if (!notification) {
        notFound();
    }

    const meeting = notification.meeting;
    const city = notification.city;
    const meetingDate = new Date(meeting.dateTime);
    const typeLabel = notification.type === 'beforeMeeting' ? 'Επερχόμενη Συνεδρίαση' : 'Περίληψη Συνεδρίασης';

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">
                                {typeLabel}
                            </h1>
                            <p className="text-sm text-gray-500">
                                OpenCouncil Ενημέρωση
                            </p>
                        </div>
                        <Link
                            href={`/${city.id}/meetings/${meeting.id}`}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                            Δείτε τη Συνεδρίαση
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </div>

                    {/* Meeting Info */}
                    <div className="space-y-3">
                        <div className="flex items-center text-gray-700">
                            <Building2 className="h-5 w-5 mr-2 text-gray-400" />
                            <span className="font-medium">{meeting.administrativeBody?.name || 'Συνεδρίαση'}</span>
                        </div>
                        <div className="flex items-center text-gray-700">
                            <MapPin className="h-5 w-5 mr-2 text-gray-400" />
                            <span>{city.name_municipality}</span>
                        </div>
                        <div className="flex items-center text-gray-700">
                            <Calendar className="h-5 w-5 mr-2 text-gray-400" />
                            <span>{format(meetingDate, 'PPP', { locale: el })}</span>
                        </div>
                    </div>
                </div>

                {/* Subjects */}
                <div className="space-y-4 mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 px-1">
                        Θέματα που σας αφορούν ({notification.subjects.length})
                    </h2>

                    {notification.subjects.map((ns: any) => {
                        const subject = ns.subject;
                        return (
                            <div key={ns.id} className="bg-white shadow-sm rounded-lg p-6">
                                {/* Reason Badge */}
                                <div className="mb-3">
                                    {getReasonBadge(ns.reason)}
                                </div>

                                {/* Subject Title */}
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    {subject.name}
                                </h3>

                                {/* Subject Description */}
                                <p className="text-gray-700 mb-4">
                                    {subject.description}
                                </p>

                                {/* Topic and Location */}
                                <div className="flex flex-wrap gap-2">
                                    {subject.topic && (
                                        <span
                                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white"
                                            style={{ backgroundColor: subject.topic.colorHex }}
                                        >
                                            <Tag className="h-3 w-3 mr-1" />
                                            {subject.topic.name}
                                        </span>
                                    )}

                                    {subject.location && (
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                                            <MapPin className="h-3 w-3 mr-1" />
                                            {subject.location.text}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="bg-white shadow-sm rounded-lg p-6">
                    <div className="text-center">
                        <Link
                            href={`/${city.id}/meetings/${meeting.id}`}
                            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-black hover:bg-gray-800"
                        >
                            Δείτε την πλήρη συνεδρίαση
                            <ChevronRight className="ml-2 h-5 w-5" />
                        </Link>

                        <p className="mt-4 text-sm text-gray-500">
                            Δεν θέλετε να λαμβάνετε ειδοποιήσεις;{' '}
                            <Link href="/profile" className="text-blue-600 hover:text-blue-800 underline">
                                Διαχειριστείτε τις προτιμήσεις σας
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

