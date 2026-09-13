import { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import ReloadButton from "@/components/pwa/ReloadButton";

// The page the service worker (public/sw.js) shows when a navigation fails
// without a network. It is cached at worker install, so keep it free of
// per-user data and of anything that needs a request to render.
export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('pwa.offline');
    return {
        title: `${t('title')} | OpenCouncil`,
        robots: { index: false, follow: false },
    };
}

export default async function OfflinePage() {
    const t = await getTranslations('pwa.offline');

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
            <Image src="/logo.png" alt="OpenCouncil" width={96} height={96} className="h-24 w-24 object-contain" priority />
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="max-w-sm text-muted-foreground">{t('body')}</p>
            <ReloadButton label={t('retry')} />
        </div>
    );
}
