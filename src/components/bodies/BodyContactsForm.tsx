"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { DocumentSendFields } from '@/components/cities/DocumentSendFields';
import { useToast } from '@/hooks/use-toast';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import type { BodyContacts } from '@/lib/db/types';
import {
    bodyContactsFormSchema,
    documentSendCardsFromSettings,
    documentSendSettingsFromCards,
} from '@/lib/zod-schemas/administrativeBody';
import { apiErrorMessage } from '@/lib/utils/validationIssues';
import { useValidationMessage, useZodResolver } from '@/hooks/useLocalizedValidation';

interface BodyContactsFormProps {
    cityId: string;
    bodyId: string;
    contacts: BodyContacts;
}

/**
 * The settings an admin of the body changes (#828, #874): the YouTube channel
 * that the livestream matcher watches, and the documents that the platform
 * sends by email, with the same cards as the body form of the city. PUT with
 * these fields alone reaches the contacts write of the body route.
 */
export function BodyContactsForm({ cityId, bodyId, contacts }: BodyContactsFormProps) {
    const t = useTranslations('body');
    const router = useRouter();
    const { toast } = useToast();
    const validationMessage = useValidationMessage();
    const [error, setError] = useState<string | null>(null);
    const form = useForm({
        resolver: useZodResolver(bodyContactsFormSchema),
        defaultValues: {
            youtubeChannelUrl: contacts.youtubeChannelUrl ?? '',
            documentSendSettings: documentSendCardsFromSettings(contacts.documentSendSettings),
        },
    });

    async function save(values: z.output<typeof bodyContactsFormSchema>) {
        setError(null);
        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${bodyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    youtubeChannelUrl: values.youtubeChannelUrl ?? '',
                    documentSendSettings: documentSendSettingsFromCards(values.documentSendSettings),
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(apiErrorMessage(data, response.status, t('saveFailed'), validationMessage));
            }
            toast({ title: t('saved') });
            router.refresh();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : t('saveFailed');
            setError(message);
            toast({ title: t('saveFailed'), description: message, variant: 'destructive' });
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(save)} className={cn(surfaceCardClass, 'space-y-5 p-5')}>
                <div>
                    <h2 className="!m-0 !text-left text-lg">{t('contactsTitle')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t('contactsIntro')}</p>
                </div>
                <FormField
                    control={form.control}
                    name="youtubeChannelUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('youtubeChannel')}</FormLabel>
                            <FormControl>
                                <Input {...field} type="url" placeholder="https://www.youtube.com/@..." />
                            </FormControl>
                            <FormDescription>{t('youtubeChannelHint')}</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DocumentSendFields form={form} />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('save')}
                </Button>
            </form>
        </Form>
    );
}
