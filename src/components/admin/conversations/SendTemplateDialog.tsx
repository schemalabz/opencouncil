'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Send, Loader2, CheckCircle, XCircle, MessageSquare, Bell } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import {
    sendTestTemplate,
    sendTestSms,
    sendTestBeforeMeetingNotification,
    listCitiesForTest,
    listMeetingsForTest,
    type CityOption,
    type MeetingOption,
} from '@/app/[locale]/(admin)/admin/conversations/actions';
import type { SendStatus } from './types';

/**
 * Top-right "Send test message" button on the admin Conversations page.
 * Tabbed dialog with two send modes:
 *   - WhatsApp: pre-approved welcome template (Messaging API). Kicks off
 *     a fresh thread; admin can then reply free-form within 24h.
 *   - SMS: free-form text (Messaging API). No template/window restrictions.
 */
export function SendTemplateDialog() {
    const [open, setOpen] = useState(false);
    const [phone, setPhone] = useState('');
    // WhatsApp template fields
    const [userName, setUserName] = useState('');
    const [cityName, setCityName] = useState('Athens');
    // SMS body field
    const [smsBody, setSmsBody] = useState('');
    // Before-meeting test fields
    const [cities, setCities] = useState<CityOption[]>([]);
    const [meetings, setMeetings] = useState<MeetingOption[]>([]);
    const [selectedCityId, setSelectedCityId] = useState('');
    const [selectedMeetingId, setSelectedMeetingId] = useState('');
    const [meetingsLoading, setMeetingsLoading] = useState(false);
    const [status, setStatus] = useState<SendStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const reset = () => {
        setStatus('idle');
        setError(null);
    };

    // Load the city list once when the dialog opens; meetings are loaded on
    // demand when a city is selected.
    useEffect(() => {
        if (!open || cities.length > 0) return;
        listCitiesForTest().then(setCities).catch(() => setCities([]));
    }, [open, cities.length]);

    useEffect(() => {
        if (!selectedCityId) {
            setMeetings([]);
            setSelectedMeetingId('');
            return;
        }
        setMeetingsLoading(true);
        listMeetingsForTest(selectedCityId)
            .then((m) => setMeetings(m))
            .catch(() => setMeetings([]))
            .finally(() => setMeetingsLoading(false));
        setSelectedMeetingId('');
    }, [selectedCityId]);

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setPhone('');
            setUserName('');
            setCityName('Athens');
            setSmsBody('');
            setSelectedCityId('');
            setSelectedMeetingId('');
            reset();
        }
    };

    const submitWhatsApp = () => {
        const trimmed = phone.trim();
        if (!trimmed) return;
        setStatus('sending');
        setError(null);
        startTransition(async () => {
            const result = await sendTestTemplate({
                phone: trimmed,
                userName: userName || undefined,
                cityName: cityName || undefined,
            });
            if (result.success) {
                setStatus('sent');
            } else {
                setStatus('error');
                setError(result.error ?? 'Send failed');
            }
            router.refresh();
        });
    };

    const submitSms = () => {
        const trimmed = phone.trim();
        if (!trimmed || !smsBody.trim()) return;
        setStatus('sending');
        setError(null);
        startTransition(async () => {
            const result = await sendTestSms({ phone: trimmed, body: smsBody.trim() });
            if (result.success) {
                setStatus('sent');
            } else {
                setStatus('error');
                setError(result.error ?? 'Send failed');
            }
            router.refresh();
        });
    };

    const submitBeforeMeeting = () => {
        const trimmed = phone.trim();
        if (!trimmed || !selectedCityId || !selectedMeetingId) return;
        setStatus('sending');
        setError(null);
        startTransition(async () => {
            const result = await sendTestBeforeMeetingNotification({
                phone: trimmed,
                cityId: selectedCityId,
                meetingId: selectedMeetingId,
            });
            if (result.success) {
                setStatus('sent');
            } else {
                setStatus('error');
                setError(result.error ?? 'Send failed');
            }
            router.refresh();
        });
    };

    const phoneValid = /^\+[0-9]{6,}$/.test(phone.trim());

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Send className="h-4 w-4" />
                    Send test message
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Send test message</DialogTitle>
                    <DialogDescription>
                        Use a phone you control so you can reply and exercise the full
                        inbound flow via the webhook.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="send-template-phone">Phone (E.164)</Label>
                        <Input
                            id="send-template-phone"
                            type="tel"
                            placeholder="+306900000000"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            disabled={pending}
                        />
                    </div>

                    <Tabs defaultValue="whatsapp" local onValueChange={reset}>
                        <TabsList className="grid grid-cols-3">
                            <TabsTrigger value="whatsapp" className="gap-2">
                                <FaWhatsapp className="h-3.5 w-3.5 text-[#25D366]" />
                                Welcome
                            </TabsTrigger>
                            <TabsTrigger value="sms" className="gap-2">
                                <MessageSquare className="h-3.5 w-3.5" />
                                SMS
                            </TabsTrigger>
                            <TabsTrigger value="before-meeting" className="gap-2">
                                <Bell className="h-3.5 w-3.5" />
                                Notification
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="whatsapp" className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Sends the pre-approved welcome template. Slots:{' '}
                                <code>userName</code>, <code>cityName</code>.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="send-template-name">User name</Label>
                                    <Input
                                        id="send-template-name"
                                        placeholder="Friend"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                        disabled={pending}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="send-template-city">City</Label>
                                    <Input
                                        id="send-template-city"
                                        placeholder="Athens"
                                        value={cityName}
                                        onChange={(e) => setCityName(e.target.value)}
                                        disabled={pending}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={pending}
                                >
                                    Close
                                </Button>
                                <Button onClick={submitWhatsApp} disabled={pending || !phoneValid}>
                                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send WhatsApp
                                </Button>
                            </DialogFooter>
                        </TabsContent>

                        <TabsContent value="sms" className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Free-form text via SMS. No template restrictions; sends instantly.
                            </p>
                            <div className="space-y-1.5">
                                <Label htmlFor="send-sms-body">Message</Label>
                                <Textarea
                                    id="send-sms-body"
                                    placeholder="Hello from OpenCouncil!"
                                    rows={3}
                                    value={smsBody}
                                    onChange={(e) => setSmsBody(e.target.value)}
                                    disabled={pending}
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={pending}
                                >
                                    Close
                                </Button>
                                <Button
                                    onClick={submitSms}
                                    disabled={pending || !phoneValid || !smsBody.trim()}
                                >
                                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send SMS
                                </Button>
                            </DialogFooter>
                        </TabsContent>

                        <TabsContent value="before-meeting" className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Creates a real <code>Notification</code> +{' '}
                                <code>NotificationDelivery</code> for the matching user, then
                                runs <code>releaseNotifications</code>. Use to exercise the
                                full unsubscribe-by-reply chain. The phone must already match
                                a User row.
                            </p>
                            <div className="space-y-1.5">
                                <Label htmlFor="send-bm-city">City</Label>
                                <Select
                                    value={selectedCityId}
                                    onValueChange={setSelectedCityId}
                                    disabled={pending || cities.length === 0}
                                >
                                    <SelectTrigger id="send-bm-city">
                                        <SelectValue placeholder="Select a city" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cities.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="send-bm-meeting">Meeting</Label>
                                <Select
                                    value={selectedMeetingId}
                                    onValueChange={setSelectedMeetingId}
                                    disabled={pending || !selectedCityId || meetingsLoading || meetings.length === 0}
                                >
                                    <SelectTrigger id="send-bm-meeting">
                                        <SelectValue
                                            placeholder={
                                                !selectedCityId
                                                    ? 'Pick a city first'
                                                    : meetingsLoading
                                                        ? 'Loading meetings…'
                                                        : meetings.length === 0
                                                            ? 'No meetings for this city'
                                                            : 'Select a meeting'
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {meetings.map((m) => (
                                            <SelectItem key={m.id} value={m.id}>
                                                {new Date(m.dateTime).toLocaleDateString('el-GR')} — {m.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={pending}
                                >
                                    Close
                                </Button>
                                <Button
                                    onClick={submitBeforeMeeting}
                                    disabled={
                                        pending || !phoneValid || !selectedCityId || !selectedMeetingId
                                    }
                                >
                                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send notification
                                </Button>
                            </DialogFooter>
                        </TabsContent>
                    </Tabs>

                    {status === 'sent' && (
                        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            <span>Message queued. Check the recipient phone.</span>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span className="break-words">{error}</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
