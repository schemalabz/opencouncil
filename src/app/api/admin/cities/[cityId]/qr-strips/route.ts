import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCouncilQrStrips } from "@/lib/admin/councilQrStrips";
import { handleApiError } from "@/lib/api/errors";

/**
 * The data behind a city's claim QR strips, for the PDF the browser renders.
 * Superadmins only: every response carries live claim codes. Never cached,
 * because every call mints new codes.
 */
export async function GET(_request: Request, props: { params: Promise<{ cityId: string }> }) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { cityId } = await props.params;
    try {
        const strips = await getCouncilQrStrips(cityId);
        if (!strips) {
            return NextResponse.json({ error: "City not found" }, { status: 404 });
        }
        return NextResponse.json(strips, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return handleApiError(error, "Failed to build the QR strips");
    }
}
