import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Calendar, Building2, ChevronRight, Bell, Mail, MessageSquare, Clock, Youtube } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { el } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReasonBadge } from '@/components/notifications/ReasonBadge';
import Icon from '@/components/icon';
import { ColorPercentageRing } from '@/components/ui/color-percentage-ring';
import { getNotificationForView } from '@/lib/db/notifications';
import { stripMarkdown } from '@/lib/formatters/markdown';

export default async function NotificationPage({ params }: { params: { id: string; locale: string } }) {
    const notification = await getNotificationForView(params.id);

    if (!notification) {
        notFound();
    }

    const meeting = notification.meeting;
    const city = notification.city;
    const meetingDate = new Date(meeting.dateTime);
    const typeLabel = notification.type === 'beforeMeeting' ? 'Ειδοποίηση επερχόμενης συνεδρίασης' : 'Ειδοποίηση πρόσφατης συνεδρίασης';

    return (
        <div className="min-h-screen py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
                {/* Header */}
                <div className="text-center space-y-1.5 sm:space-y-2">
                    <div className="inline-flex items-center justify-center p-2 sm:p-2.5 rounded-full bg-orange-100">
                        <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight px-2">
                        {typeLabel}
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground px-2">
                        Προσωποποιημένη ενημέρωση από το OpenCouncil {notification.user.name ? `για τον/την ${notification.user.name}` : ''}
                    </p>
                </div>
                <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground font-mono px-2">
                    {notification.deliveries.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 sm:gap-x-2 sm:gap-y-1.5">
                            {notification.deliveries.map((delivery, idx) => (
                                <div key={delivery.id} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/30">
                                    {delivery.messageSentVia === 'whatsapp' ? (
                                        <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                                    ) : delivery.messageSentVia === 'sms' ? (
                                        <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                                    ) : (
                                        <Mail className="w-2.5 h-2.5 shrink-0" />
                                    )}
                                    <span className="whitespace-nowrap">
                                        {delivery.messageSentVia === 'whatsapp' ? 'WhatsApp' :
                                            delivery.messageSentVia === 'sms' ? 'SMS' : 'Email'}
                                    </span>
                                    {delivery.sentAt && (
                                        <>
                                            <span className="mx-0.5">•</span>
                                            <span className="whitespace-nowrap">
                                                {formatDistanceToNow(new Date(delivery.sentAt), { addSuffix: true, locale: el })}
                                            </span>
                                        </>
                                    )}
                                    {!delivery.sentAt && delivery.status === 'pending' && (
                                        <span className="text-muted-foreground/70 ml-0.5">σε αναμονή</span>
                                    )}
                                    {delivery.status === 'failed' && (
                                        <span className="text-destructive ml-0.5">απέτυχε</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-muted-foreground/70 text-center">Δεν έχουν δημιουργηθεί ακόμα</span>
                    )}
                </div>

                {/* Meeting Context */}
                <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 place-items-center">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm break-words">{meeting.administrativeBody?.name || 'Συνεδρίαση'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm break-words">{city.name_municipality}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm">{format(meetingDate, 'PPP', { locale: el })}</span>
                        </div>
                    </div>
                </div>

                {/* Subjects Section */}
                <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-base sm:text-lg font-bold">
                            Επιλεγμένα θέματα για εσάς
                        </h2>
                        <Badge variant="secondary" className="text-xs font-semibold">
                            {notification.subjects.length}
                        </Badge>
                    </div>

                    <div className="space-y-3">
                        {notification.subjects.map((ns: any) => {
                            const subject = ns.subject;
                            return (
                                <Link
                                    key={ns.id}
                                    href={`/${city.id}/${meeting.id}/subjects/${subject.id}`}
                                    className="block hover:no-underline"
                                >
                                    <Card className="group hover:shadow-md transition-all duration-300 cursor-pointer">
                                        <CardHeader className="pb-3">
                                            <div className="flex gap-2">
                                                <div
                                                    className="p-1.5 rounded-lg shrink-0 transition-colors duration-300 flex items-center justify-center self-center"
                                                    style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}
                                                >
                                                    <Icon
                                                        name={subject.topic?.icon as any || "Hash"}
                                                        color={subject.topic?.colorHex || "#9ca3af"}
                                                        size={14}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <CardTitle className="text-xs sm:text-sm leading-5 line-clamp-2 group-hover:text-accent-foreground transition-colors duration-300 flex-1 min-w-0">
                                                            {subject.name}
                                                        </CardTitle>
                                                        <div className="pointer-events-auto shrink-0">
                                                            <ReasonBadge reason={ns.reason} />
                                                        </div>
                                                    </div>
                                                    {subject.location && (
                                                        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                                                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                                                            <span className="truncate">
                                                                {subject.location.text}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        {subject.description && (
                                            <CardContent className="pt-0">
                                                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed group-hover:text-muted-foreground/80 transition-colors duration-300">
                                                    {stripMarkdown(subject.description)}
                                                </p>
                                            </CardContent>
                                        )}
                                        {subject.statistics && subject.statistics.speakingSeconds > 0 && (
                                            <CardContent className="pt-3 border-t bg-muted/20">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="shrink-0">
                                                        <ColorPercentageRing
                                                            data={subject.statistics.parties?.map((p: any) => ({
                                                                color: p.item.colorHex,
                                                                percentage: (p.speakingSeconds / subject.statistics.speakingSeconds) * 100
                                                            })) || []}
                                                            size={36}
                                                            thickness={3}
                                                        >
                                                            <div className="flex flex-col items-center">
                                                                <div className="text-[9px] font-semibold leading-none">
                                                                    {Math.round(subject.statistics.speakingSeconds / 60)}
                                                                </div>
                                                                <div className="text-[7px] text-muted-foreground leading-none mt-0.5">
                                                                    λεπτ
                                                                </div>
                                                            </div>
                                                        </ColorPercentageRing>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1 mb-1.5">
                                                            <Clock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                                            <span className="text-[8px] font-medium text-muted-foreground">Χρόνος συζήτησης</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                            {subject.statistics.parties?.slice(0, 3).map((p: any) => (
                                                                <div key={p.item.id} className="flex items-center gap-1">
                                                                    <div
                                                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                                                        style={{ backgroundColor: p.item.colorHex }}
                                                                    />
                                                                    <span className="text-[7px] text-muted-foreground font-medium">
                                                                        {Math.round((p.speakingSeconds / subject.statistics.speakingSeconds) * 100)}%
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Footer CTA */}
                <div className="pt-3 sm:pt-4 space-y-2 sm:space-y-3 px-2">
                    {notification.type === 'beforeMeeting' && (
                        <Card className="bg-muted/30">
                            <CardContent className="pt-4 pb-4">
                                <p className="text-center text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                    Αυτή η συνεδρίαση είναι προγραμματισμένη για τις {format(meetingDate, 'PPP', { locale: el })}.
                                    {meeting.administrativeBody?.youtubeChannelUrl ? (
                                        <> Μπορείτε να τη δείτε{' '}
                                            <a 
                                                href={meeting.administrativeBody.youtubeChannelUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="inline-flex items-baseline gap-1 text-primary hover:text-primary/80 underline"
                                            >
                                                <Youtube className="w-3.5 h-3.5 shrink-0 relative top-0.5" />
                                                <span>στο κανάλι του Δήμου στο YouTube</span>
                                            </a>
                                            , ή μερικές ώρες αργότερα στο OpenCouncil.
                                        </>
                                    ) : (
                                        <> Μπορείτε να τη δείτε μερικές ώρες αργότερα στο OpenCouncil.</>
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <Link
                        href={`/${city.id}/${meeting.id}`}
                        className="flex items-center justify-center w-full px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
                    >
                        Δείτε την πλήρη συνεδρίαση
                        <ChevronRight className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Link>

                    <p className="text-center text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                        Δεν θέλετε να λαμβάνετε ειδοποιήσεις;{' '}
                        <Link href={`/${params.locale}/profile`} className="text-primary hover:text-primary/80 underline">
                            Διαχειριστείτε τις προτιμήσεις σας
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

