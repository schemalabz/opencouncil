import type { Metadata } from "next";
import CurrentTimeButton from "@/components/meetings/current-time-button";
import Transcript from "@/components/meetings/transcript/Transcript";
import { getRealm } from "@/lib/realm.server";
import { getPublicExcerpt } from "@/lib/sharing/excerpts";
import { excerptMetadata } from "@/lib/sharing/excerptMetadata";
import { parseExcerptSelector, type QueryParams } from "@/lib/sharing/excerptSelector";

interface TranscriptPageProps {
    params: Promise<{ cityId: string; meetingId: string; locale: string }>;
    searchParams: Promise<QueryParams>;
}

// robots.txt lets crawlers read a transcript URL that starts with a selector,
// for link previews. None of these URLs is a page to index.
const notIndexed = { robots: { index: false, follow: true } } satisfies Metadata;

// A shared excerpt links here and unfurls as its quote. A selector for another
// meeting must not put that meeting's words on this page. The quote is an
// extra: when its lookup fails, the page keeps the meeting preview.
export async function generateMetadata(props: TranscriptPageProps): Promise<Metadata> {
    const [{ cityId, meetingId, locale }, query] = await Promise.all([props.params, props.searchParams]);
    if (!Object.hasOwn(query, 'cityId')) return {};
    const selector = parseExcerptSelector(query);
    if (!selector || selector.cityId !== cityId || selector.meetingId !== meetingId) return notIndexed;
    const result = await getPublicExcerpt(selector, await getRealm()).catch(() => null);
    return result?.status === 'ok' ? { ...await excerptMetadata(result.excerpt, locale), ...notIndexed } : notIndexed;
}

export default function TranscriptPage() {
    return <>
        <Transcript />
        <CurrentTimeButton />
    </>
}
