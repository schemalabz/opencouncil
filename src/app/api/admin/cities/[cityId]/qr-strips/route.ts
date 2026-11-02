import { NextResponse } from "next/server";
import * as z from "zod";
import { withRight } from "@/lib/auth";
import { getCouncilQrStrips } from "@/lib/admin/councilQrStrips";
import { handleApiError } from "@/lib/api/errors";

/** A city has a few hundred people at most; the cap only stops a runaway body. */
const scopedRequestSchema = z.object({
    personIds: z.array(z.string().min(1)).min(1).max(2000),
});

/**
 * The data behind a city's claim QR strips, for the PDF the browser renders.
 * Admins of the city only: every response carries live claim codes. Never
 * cached, because every call mints new codes. GET is the whole city; POST
 * narrows it to the `personIds` it sends, and only the eligible ones among
 * them get a strip.
 */
async function respond(cityId: string, read?: (() => Promise<string[] | NextResponse>)) {
    try {
        // The gate before the body: an anonymous caller learns nothing from a 400.
        await withRight("admin", { cityId });
        const personIds = read ? await read() : undefined;
        if (personIds instanceof NextResponse) return personIds;
        const strips = await getCouncilQrStrips(cityId, personIds);
        if (!strips) {
            return NextResponse.json({ error: "City not found" }, { status: 404 });
        }
        return NextResponse.json(strips, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return handleApiError(error, "Failed to build the QR strips");
    }
}

export async function GET(_request: Request, props: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await props.params;
    return respond(cityId);
}

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await props.params;
    return respond(cityId, async () => {
        const parsed = scopedRequestSchema.safeParse(await request.json().catch(() => null));
        return parsed.success ? parsed.data.personIds : handleApiError(parsed.error, "Validation failed");
    });
}
