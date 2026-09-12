import { ArrowUpRight, FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { localePath } from '@/lib/sharing/excerptSelector';
import Logo from '@/components/layout/Logo';

export function SharePageShell({ children }: { children: React.ReactNode; locale: string }) {
    return <main id="main-content" className="min-h-[80vh] bg-background px-5 pb-16 pt-5 sm:px-8 sm:pt-8">
        <div className="mx-auto max-w-[720px]">
            <Logo className="mb-8 min-h-11 w-fit sm:mb-10" imageClassName="dark:invert" textClassName="font-normal text-foreground" />
            {children}
        </div>
    </main>;
}

export async function ShareUnavailable({ locale, changed = false, meetingUrl }: { locale: string; changed?: boolean; meetingUrl?: string }) {
    const t = await getTranslations({ locale, namespace: 'sharing' });
    return <SharePageShell locale={locale}>
        <FileText className="mb-6 size-8 text-muted-foreground" />
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{t(changed ? 'sourceChangedTitle' : 'unavailableTitle')}</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">{t(changed ? 'sourceChangedDescription' : 'unavailableDescription')}</p>
        <a href={meetingUrl ?? localePath(locale, '/')} className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4">
            {t(meetingUrl ? 'openMeeting' : 'backToOC')}<ArrowUpRight className="size-4" />
        </a>
    </SharePageShell>;
}
