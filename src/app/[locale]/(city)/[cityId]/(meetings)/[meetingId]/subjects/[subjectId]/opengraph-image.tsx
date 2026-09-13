// See src/app/api/og/route.tsx for why we use @vercel/og directly instead of next/og.
import { ImageResponse } from "@vercel/og";
import { getTranslations } from "next-intl/server";
import { getMeetingDataForOG } from "@/lib/db/meetings";
import { getSubjectsForMeetingCached, getSubjectStatisticsCached } from "@/lib/cache/queries";
import { LOGO_BLACK_DATA_URI, OG_FONTS } from "@/lib/og/serverAssets";
import { getImageData } from "@/lib/og/remoteImage";
import { getSubjectIllustrationData, ILLUSTRATION_BOX } from "@/lib/og/illustration";
import { topicGlyph } from "@/lib/og/topicIcon";
import { topicStyleHex } from "@/lib/topicStyle";
import { getLocalizedMunicipalityName, getLocalizedName } from "@/lib/formatters/name";
import { formatDate } from "@/lib/formatters/time";
import { localizeText } from "@/lib/serbian";
import { OG, OgContextChip, OgFacts, OgFoot, OgFrame, OgHeader, OgTitle, OgTopicPill } from "@/components/og/frame";

// Image configuration
export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

/** The header row: the lockup (39px) or the seal chip (44px), whichever is taller, inside its padding. */
const HEADER_HEIGHT = 44 + 44 + 24;
const HERO_HEIGHT = size.height - HEADER_HEIGHT;

/**
 * The subject page's own header, as an unfurl: the illustration edge to edge
 * under the site's chrome, the topic and the title on its foot. Without an
 * illustration, the topic's wash and glyph, as the page draws the placeholder.
 */
export default async function SubjectOgImage({
    params,
}: {
    params: Promise<{
        locale: string;
        cityId: string;
        meetingId: string;
        subjectId: string;
    }>;
}) {
    const { locale, cityId, meetingId, subjectId } = await params;
    const t = await getTranslations({ locale, namespace: "og" });

    const [meeting, subjects] = await Promise.all([
        getMeetingDataForOG(cityId, meetingId),
        getSubjectsForMeetingCached(cityId, meetingId),
    ]);
    const subject = subjects.find(s => s.id === subjectId);

    if (!meeting || !subject) {
        return new ImageResponse(
            (
                <OgFrame>
                    <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24} />
                    <div style={{ display: "flex", flex: 1, alignItems: "center", padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
                        <OgTitle size={44} color={OG.MUTED}>{t("subject.notFound")}</OgTitle>
                    </div>
                </OgFrame>
            ),
            { ...size, fonts: OG_FONTS },
        );
    }

    const statisticsRecord = await getSubjectStatisticsCached(cityId, meetingId, subjects, meeting.dateTime);
    const statistics = statisticsRecord[subject.id];
    // statistics.speakingSeconds, as the subject page counts it.
    const minutes = Math.round((statistics?.speakingSeconds ?? 0) / 60);
    const speakers = statistics?.people?.length ?? 0;

    const [illustration, seal] = await Promise.all([
        getSubjectIllustrationData(subject.id, ILLUSTRATION_BOX.hero),
        getImageData(meeting.city.logoImage, { width: 88, height: 88, fit: "inside" }),
    ]);
    const colors = topicStyleHex(subject.topic?.colorHex);
    const context = [getLocalizedMunicipalityName(meeting.city, locale), meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null]
        .filter(Boolean).join(" · ");
    const facts = [formatDate(new Date(meeting.dateTime), undefined, locale)];
    if (speakers > 0) facts.push(t("subject.speakers", { count: speakers }));
    if (minutes > 0) facts.push(t("subject.discussion", { minutes }));

    return new ImageResponse(
        (
            <OgFrame>
                <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24}>
                    <OgContextChip text={context} logoSrc={seal} />
                </OgHeader>
                <div style={{ display: "flex", position: "relative", width: size.width, height: HERO_HEIGHT, overflow: "hidden", background: colors.background }}>
                    {illustration ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={illustration} width={size.width} height={HERO_HEIGHT} alt="" style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
                    ) : (
                        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: size.width, height: HERO_HEIGHT, alignItems: "center", justifyContent: "center" }}>
                            {topicGlyph(subject.topic?.icon, 160, colors.icon)}
                        </div>
                    )}
                    <OgFoot padding={`120px ${OG.PAD}px 44px`}>
                        {subject.topic && (
                            <OgTopicPill
                                name={getLocalizedName(subject.topic, locale)}
                                colors={colors}
                                glyph={topicGlyph(subject.topic.icon, 22, colors.icon)}
                            />
                        )}
                        <div style={{ display: "flex", marginTop: 16 }}>
                            <OgTitle size={52} color="#ffffff" maxWidth={1000}>{localizeText(subject.name, locale)}</OgTitle>
                        </div>
                        <div style={{ display: "flex", marginTop: 16 }}>
                            <OgFacts items={facts} color="rgba(255,255,255,0.85)" />
                        </div>
                    </OgFoot>
                </div>
            </OgFrame>
        ),
        { ...size, fonts: OG_FONTS },
    );
}
