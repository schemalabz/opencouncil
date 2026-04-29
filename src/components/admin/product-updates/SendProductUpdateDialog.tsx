'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
    ProductUpdateEmailEditor,
    type ProductUpdateEmailEditorHandle,
} from './ProductUpdateEmailEditor';
import { DEFAULT_PRODUCT_UPDATE_TEMPLATE_MARKDOWN } from '@/lib/email/templates/productUpdateDefault';

interface SendResult {
    sent: number;
    failed: number;
    failedEmails: string[];
}

interface RecipientCounts {
    optedIn: number;
    total: number;
}

type Status = 'idle' | 'confirming-all' | 'sending-test' | 'sending-all' | 'success' | 'error';

export function SendProductUpdateDialog() {
    const t = useTranslations('ProductUpdates');
    const editorRef = useRef<ProductUpdateEmailEditorHandle>(null);
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [testEmail, setTestEmail] = useState('');
    const [recipients, setRecipients] = useState<RecipientCounts | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [result, setResult] = useState<SendResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Fetch the live recipient counts (opted-in + total registered) when the dialog opens.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setRecipients(null);
        fetch('/api/admin/product-updates/recipients')
            .then((res) => (res.ok ? res.json() : { optedIn: 0, total: 0 }))
            .then((data) => {
                if (cancelled) return;
                const optedIn = typeof data?.optedIn === 'number' ? data.optedIn : 0;
                const total = typeof data?.total === 'number' ? data.total : 0;
                setRecipients({ optedIn, total });
            })
            .catch(() => {
                if (!cancelled) setRecipients({ optedIn: 0, total: 0 });
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const reset = () => {
        setStatus('idle');
        setResult(null);
        setErrorMessage(null);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setSubject('');
            setTestEmail('');
            reset();
        }
    };

    const send = async (
        extra: Record<string, unknown>,
        nextStatus: Exclude<Status, 'idle' | 'success' | 'error'>,
    ) => {
        reset();

        const bodyHtml = editorRef.current?.getSanitizedHtml() ?? '';
        if (!subject.trim() || !bodyHtml.trim()) {
            setErrorMessage(t('missingContent'));
            setStatus('error');
            return;
        }

        setStatus(nextStatus);
        try {
            const res = await fetch('/api/admin/product-updates/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, bodyHtml, ...extra }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setErrorMessage(data?.error ?? `HTTP ${res.status}`);
                setStatus('error');
                return;
            }
            const data: SendResult = await res.json();
            setResult(data);
            setStatus('success');
        } catch (error) {
            console.error('Product update send error:', error);
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStatus('error');
        }
    };

    const sendTest = () => send({ testEmail }, 'sending-test');
    const requestSendAll = () => {
        // Two-step send: first click opens the inline confirmation, second click confirms.
        reset();
        setStatus('confirming-all');
    };
    const confirmSendAll = () => send({}, 'sending-all');
    const cancelSendAll = () => setStatus('idle');

    const isLoading = status === 'sending-test' || status === 'sending-all';
    const isConfirming = status === 'confirming-all';
    const testEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Mail className="h-4 w-4" />
                    {t('triggerButton')}
                </Button>
            </DialogTrigger>
            <DialogContent align="start" className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('dialogTitle')}</DialogTitle>
                    <DialogDescription>{t('dialogDescription')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 w-full">
                    <div className="space-y-2">
                        <Label htmlFor="product-update-subject">{t('subjectLabel')}</Label>
                        <Input
                            id="product-update-subject"
                            type="text"
                            placeholder={t('subjectPlaceholder')}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="product-update-body">{t('bodyLabel')}</Label>
                        <div className="rounded-md border bg-background">
                            <ProductUpdateEmailEditor
                                ref={editorRef}
                                initialContent={DEFAULT_PRODUCT_UPDATE_TEMPLATE_MARKDOWN}
                                textareaId="product-update-body"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="product-update-test-email">{t('testEmailLabel')}</Label>
                        <Input
                            id="product-update-test-email"
                            type="email"
                            placeholder={t('testEmailPlaceholder')}
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            disabled={isLoading}
                        />
                        <p className="text-xs text-muted-foreground">{t('testEmailHelp')}</p>
                    </div>

                    {status === 'success' && result && (
                        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">{t('successTitle')}</p>
                                <p>{t('successSummary', { sent: result.sent, failed: result.failed })}</p>
                                {result.failedEmails.length > 0 && (
                                    <details className="mt-1 text-xs">
                                        <summary className="cursor-pointer select-none font-medium">
                                            {t('failedListWithCount', { count: result.failedEmails.length })}
                                        </summary>
                                        <p className="mt-1 break-all">
                                            {result.failedEmails.join(', ')}
                                        </p>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">{t('errorTitle')}</p>
                                <p>{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {isConfirming && recipients && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <p>
                                {t('confirmSendDescription', {
                                    optedIn: recipients.optedIn,
                                    total: recipients.total,
                                })}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {isConfirming && recipients ? (
                        <>
                            <Button variant="outline" onClick={cancelSendAll}>
                                {t('cancelButton')}
                            </Button>
                            <Button onClick={confirmSendAll} variant="default">
                                {t('confirmSendButton')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={sendTest}
                                disabled={isLoading || !testEmailValid}
                            >
                                {status === 'sending-test' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('sendTestButton')}
                            </Button>
                            <Button
                                onClick={requestSendAll}
                                disabled={isLoading || recipients?.optedIn === 0 || status === 'success'}
                                variant="default"
                            >
                                {status === 'sending-all' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {recipients === null
                                    ? t('sendAllButton')
                                    : t('sendAllButtonWithCount', { optedIn: recipients.optedIn })}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
