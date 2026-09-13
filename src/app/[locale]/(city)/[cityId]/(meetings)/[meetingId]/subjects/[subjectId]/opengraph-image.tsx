// See src/app/api/og/route.tsx for why we use @vercel/og directly instead of next/og.
import { ImageResponse } from "@vercel/og";
import { OG_FONTS } from "@/lib/og/serverAssets";
import { ogCacheControl } from "@/lib/og/render";
import { subjectOgElement, SUBJECT_OG_SIZE } from "@/lib/og/subjectImage";

// Image configuration
export const size = SUBJECT_OG_SIZE;

export const contentType = "image/png";

/** The subject page's unfurl; `src/lib/og/subjectImage.tsx` draws it, and /api/og draws the same element inside its slot. */
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
    const { element, settled } = await subjectOgElement(locale, cityId, meetingId, subjectId);
    return new ImageResponse(element, { ...size, fonts: OG_FONTS, headers: { "Cache-Control": ogCacheControl(settled) } });
}
