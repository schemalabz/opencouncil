import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const record = await prisma.meetingOperator.findUnique({
        where: {
            meetingCityId_meetingId: {
                meetingCityId: params.cityId,
                meetingId: params.meetingId,
            },
        },
        include: {
            user: {
                select: { id: true, name: true, email: true },
            },
        },
    });

    return NextResponse.json({ operator: record?.user ?? null });
}

export async function PUT(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { userId } = await request.json();

    if (userId !== null && typeof userId !== 'string') {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    if (userId === null) {
        await prisma.meetingOperator.deleteMany({
            where: {
                meetingCityId: params.cityId,
                meetingId: params.meetingId,
            },
        });
        return NextResponse.json({ operator: null });
    }

    // Verify target user exists and is a superadmin
    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isSuperAdmin: true },
    });

    if (!targetUser || !targetUser.isSuperAdmin) {
        return NextResponse.json(
            { error: "User not found or is not a superadmin" },
            { status: 400 }
        );
    }

    await prisma.meetingOperator.upsert({
        where: {
            meetingCityId_meetingId: {
                meetingCityId: params.cityId,
                meetingId: params.meetingId,
            },
        },
        create: {
            meetingCityId: params.cityId,
            meetingId: params.meetingId,
            userId,
        },
        update: {
            userId,
        },
    });

    const { isSuperAdmin: _, ...operatorInfo } = targetUser;
    return NextResponse.json({ operator: operatorInfo });
}
