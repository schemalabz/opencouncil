import { Metadata } from "next";
import { redirect } from "next/navigation";
import { PersonJoin } from "@/components/personJoin/PersonJoin";
import { getCurrentUser } from "@/lib/auth";
import { personJoinPagePath } from "@/lib/personJoin/paths";
import { getJoinStage } from "@/lib/personJoin/stage";

// A personal code in the URL: nothing to index, and no referrer to leak it.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

// The page is the state of one code and one session, read at request time.
export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ cityId: string }>;
    searchParams: Promise<{ c?: string | string[]; step?: string | string[] }>;
}

/**
 * The join flow behind a councillor's QR: is this you, your email, the
 * consent. Every step is derived from the code, the database and the
 * session, so a reload, a second phone or the link in the email all land in
 * the right place. `step=3` only says that the reader came through the
 * email, so the progress bar counts three steps and not two.
 */
export default async function PersonJoinPage(props: PageProps) {
    const [{ cityId }, query, user] = await Promise.all([props.params, props.searchParams, getCurrentUser()]);
    const token = Array.isArray(query.c) ? query.c[0] : query.c;
    const cameThroughEmail = (Array.isArray(query.step) ? query.step[0] : query.step) === "3";

    const stage = await getJoinStage(token, user?.id ?? null);
    // A code opened under another city's path: send it to its own.
    if (stage.kind !== "invalid" && token && stage.person.cityId !== cityId) {
        redirect(personJoinPagePath(stage.person.cityId, token));
    }

    return <PersonJoin token={token ?? ""} stage={stage} totalSteps={user && !cameThroughEmail ? 2 : 3} />;
}
