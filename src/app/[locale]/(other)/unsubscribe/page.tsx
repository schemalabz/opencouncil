import { verifyUnsubscribeToken } from '@/lib/notifications/tokens';
import { UnsubscribeConfirm } from '@/components/unsubscribe/UnsubscribeConfirm';
import { getUnsubscribeContext } from '@/lib/db/notifications';
import { XCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
    searchParams: { token?: string };
}

export default async function UnsubscribePage({ searchParams }: Props) {
    const t = await getTranslations('Unsubscribe');
    const token = searchParams.token;

    const data = token ? await verifyUnsubscribeToken(token) : null;

    if (!data) {
        return (
            <div className="container max-w-md py-24 flex flex-col items-center gap-4 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <h1 className="text-xl font-semibold">{t('invalidLinkTitle')}</h1>
                <p className="text-muted-foreground">
                    {t('invalidLinkDescription')}
                </p>
            </div>
        );
    }

    const context = await getUnsubscribeContext(data.userId, data.cityId);

    if (!context) {
        return (
            <div className="container max-w-md py-24 flex flex-col items-center gap-4 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <h1 className="text-xl font-semibold">{t('invalidLinkTitle')}</h1>
                <p className="text-muted-foreground">
                    {t('invalidLinkDescription')}
                </p>
            </div>
        );
    }

    return (
        <div className="container max-w-md py-24">
            <UnsubscribeConfirm
                token={token!}
                cityName={context.cityName ?? data.cityId}
                userEmail={context.userEmail}
                allowProductUpdates={context.allowProductUpdates}
                allowPetitionUpdates={context.allowPetitionUpdates}
                citySubscribed={context.citySubscribed}
            />
        </div>
    );
}
