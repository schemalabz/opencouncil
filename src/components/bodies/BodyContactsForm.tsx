"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

const emailSchema = z.string().email();
const channelSchema = z.union([z.string().url(), z.literal('')]);

interface BodyContactsFormProps {
    cityId: string;
    bodyId: string;
    contacts: { youtubeChannelUrl: string | null; contactEmails: string[]; notificationBehavior: string };
    /** A body of the secondary tier (#829): its admin switches its updates on and off. */
    secondary: boolean;
}

/**
 * The settings an admin of the body changes (#828): the YouTube channel
 * that the livestream matcher watches, and the addresses that receive the
 * transcript of a meeting. On a secondary body, a switch for the updates
 * its meetings send to the readers who follow it (#829). PUT with these
 * fields alone reaches the contacts write of the body route.
 */
export function BodyContactsForm({ cityId, bodyId, contacts, secondary }: BodyContactsFormProps) {
    const t = useTranslations('body');
    const router = useRouter();
    const { toast } = useToast();
    const [channel, setChannel] = useState(contacts.youtubeChannelUrl ?? '');
    const [emails, setEmails] = useState(contacts.contactEmails.join(', '));
    // The switch writes only when it moved: a body a city admin set to
    // approval keeps that mode through a save that changes the emails alone.
    const updatesWereOn = contacts.notificationBehavior !== 'NOTIFICATIONS_DISABLED';
    const [updatesOn, setUpdatesOn] = useState(updatesWereOn);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        const trimmedChannel = channel.trim();
        if (!channelSchema.safeParse(trimmedChannel).success) {
            setError(t('invalidChannel'));
            return;
        }
        const contactEmails = emails.split(',').map(email => email.trim()).filter(Boolean);
        if (contactEmails.some(email => !emailSchema.safeParse(email).success)) {
            setError(t('invalidEmails'));
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${bodyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    youtubeChannelUrl: trimmedChannel,
                    contactEmails,
                    ...(secondary && updatesOn !== updatesWereOn
                        ? { notificationBehavior: updatesOn ? 'NOTIFICATIONS_AUTO' : 'NOTIFICATIONS_DISABLED' }
                        : {}),
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(typeof data?.error === 'string' ? data.error : t('saveFailed'));
            }
            toast({ title: t('saved') });
            router.refresh();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : t('saveFailed');
            setError(message);
            toast({ title: t('saveFailed'), description: message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={save} className={cn(surfaceCardClass, 'space-y-5 p-5')}>
            <div>
                <h2 className="!m-0 !text-left text-lg">{t('contactsTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('contactsIntro')}</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="body-channel">{t('youtubeChannel')}</Label>
                <Input
                    id="body-channel"
                    type="url"
                    value={channel}
                    onChange={event => setChannel(event.target.value)}
                    placeholder="https://www.youtube.com/@..."
                />
                <p className="text-xs text-muted-foreground">{t('youtubeChannelHint')}</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="body-emails">{t('contactEmails')}</Label>
                <Input
                    id="body-emails"
                    value={emails}
                    onChange={event => setEmails(event.target.value)}
                    placeholder="secretary@example.gr, president@example.gr"
                />
                <p className="text-xs text-muted-foreground">{t('contactEmailsHint')}</p>
            </div>
            {secondary && (
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="body-updates">{t('updatesTitle')}</Label>
                        <p className="text-xs text-muted-foreground">{t('updatesHint')}</p>
                    </div>
                    <Switch id="body-updates" checked={updatesOn} onCheckedChange={setUpdatesOn} />
                </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('save')}
            </Button>
        </form>
    );
}
