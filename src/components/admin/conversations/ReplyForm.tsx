'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MessageChannel } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CheckCircle, XCircle } from 'lucide-react';
import { sendTestReply } from '@/app/[locale]/(admin)/admin/conversations/actions';
import type { SendStatus } from './types';

/**
 * Inline reply form for the admin Conversations page. Sends free-form text
 * via the Bird Conversations API into an existing thread, on the channel
 * the conversation lives on. WhatsApp is bound by the 24h customer-service
 * window; SMS isn't.
 */
export function ReplyForm({
    conversationId,
    phone,
    channel,
}: {
    conversationId: string;
    phone: string;
    channel: MessageChannel;
}) {
    const [text, setText] = useState('');
    const [status, setStatus] = useState<SendStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const submit = () => {
        const body = text.trim();
        if (!body) return;
        setStatus('sending');
        setError(null);
        startTransition(async () => {
            const result = await sendTestReply({ conversationId, phone, text: body, channel });
            if (result.success) {
                setStatus('sent');
            } else {
                setStatus('error');
                setError(result.error ?? 'Send failed');
            }
            setText('');
            // Refresh the RSC payload in both branches so the thread picks
            // up the new row. `startTransition` alone doesn't trigger a
            // re-fetch on this dynamic admin page.
            router.refresh();
        });
    };

    return (
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t">
            <div className="flex items-end gap-2">
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={`Reply to ${phone}…`}
                    rows={2}
                    disabled={pending}
                    className="text-sm"
                />
                <Button onClick={submit} disabled={pending || !text.trim()} size="sm">
                    {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {status === 'sent' && (
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Message sent.
                </div>
            )}

            {status === 'error' && (
                <div className="flex items-start gap-1.5 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="break-words">{error}</span>
                </div>
            )}
        </div>
    );
}
