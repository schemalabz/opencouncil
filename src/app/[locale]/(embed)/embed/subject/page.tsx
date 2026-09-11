import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPublicSubject } from '@/lib/sharing/publicContent';
import { getCityRealm } from '@/lib/db/cityRealm';
import { validSourceId, type QueryParams } from '@/lib/sharing/excerptSelector';
import { parseSubjectEmbedTarget } from '@/lib/sharing/subjectEmbed';
import { parseEmbedConfig } from '@/lib/utils/embedParams';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { EmbedSingleSubject } from '@/components/embed/EmbedSingleSubject';
import { EmbedFooter } from '@/components/embed/EmbedFooter';
import '../meetings/embed.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EmbedSubjectPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<QueryParams> }) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    if (!validSourceId(query.cityId)) notFound();
    const cityRealm = await getCityRealm(query.cityId);
    if (!cityRealm) notFound();
    const target = parseSubjectEmbedTarget(query);
    const subject = target ? await getPublicSubject(target.cityId, target.meetingId, target.subjectId, cityRealm) : null;
    const t = await getTranslations({ locale, namespace: 'sharing' });
    const { mode, themeVars, appThemeShim } = parseEmbedConfig({ mode: query.mode === 'dark' ? 'dark' : 'light', radius: 'pill', accent: '#FC550A' });
    const baseUrl = realmBaseUrl(cityRealm);
    return <div className={`embed-widget embed-single-widget ${mode === 'dark' ? 'dark' : ''}`} style={{ ...themeVars, ...appThemeShim.vars } as React.CSSProperties}>
        {subject ? <EmbedSingleSubject subject={subject} locale={locale} baseUrl={baseUrl} summaryLabel={t('summary')} readLabel={t('readDiscussion')} /> : <div className="embed-empty">{t('embedUnavailable')}</div>}
        <EmbedFooter baseUrl={baseUrl} />
    </div>;
}
