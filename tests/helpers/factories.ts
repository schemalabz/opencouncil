import prisma from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

export async function createCity(data?: Partial<Prisma.CityCreateInput>) {
    const id = data?.id ?? 'testcity'
    return prisma.city.create({
        data: {
            id,
            name: data?.name ?? 'Test City',
            name_en: data?.name_en ?? 'Test City',
            name_municipality: data?.name_municipality ?? 'Municipality of Test',
            name_municipality_en: data?.name_municipality_en ?? 'Municipality of Test',
            timezone: data?.timezone ?? 'Europe/Athens',
            officialSupport: false,
            status: 'listed',
            authorityType: 'municipality',
            ...data,
        },
    })
}

export async function createAdministrativeBody(cityId: string, data?: Partial<Prisma.AdministrativeBodyUncheckedCreateInput>) {
    return prisma.administrativeBody.create({
        data: {
            name: data?.name ?? 'Council',
            name_en: data?.name_en ?? 'Council',
            type: data?.type ?? 'council',
            cityId,
            ...data,
        },
    })
}

export async function createTopic(id: string, data?: Partial<Prisma.TopicCreateInput>) {
    return prisma.topic.create({
        data: {
            id,
            name: data?.name ?? `Topic ${id}`,
            name_en: data?.name_en ?? `Topic ${id}`,
            colorHex: data?.colorHex ?? '#3366ff',
            icon: data?.icon ?? null,
            ...data,
        },
    })
}

export async function createUser(email: string, data?: Partial<Prisma.UserCreateInput>) {
    return prisma.user.create({
        data: {
            email,
            name: data?.name ?? email,
            phone: data?.phone ?? null,
            onboarded: true,
            allowContact: true,
            ...data,
        },
    })
}

export async function createMeeting(cityId: string, data?: Partial<Prisma.CouncilMeetingUncheckedCreateInput>) {
    return prisma.councilMeeting.create({
        data: {
            name: data?.name ?? 'Test Meeting',
            name_en: data?.name_en ?? 'Test Meeting',
            dateTime: data?.dateTime ?? new Date(),
            cityId,
            administrativeBodyId: data?.administrativeBodyId ?? undefined,
            ...data,
        },
    })
}

export async function createLocation({ id, text, lng, lat }: { id: string; text?: string; lng: number; lat: number }) {
    const geoJSON = { type: 'Point', coordinates: [lng, lat] }

    const res = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Location" (id, type, text, coordinates)
    VALUES (
      ${id},
      'point'::"LocationType",
      ${text ?? 'Test location'},
      ST_GeomFromGeoJSON(${JSON.stringify(geoJSON)})
    )
    RETURNING id
  `

    return { id: res[0]?.id ?? id }
}

export async function createSubject(meetingId: string, cityId: string, data?: { id?: string; name?: string; description?: string; topicId?: string | null; locationId?: string | null }) {
    return prisma.subject.create({
        data: {
            id: data?.id,
            name: data?.name ?? 'Subject',
            description: data?.description ?? 'Subject description',
            topicId: data?.topicId ?? null,
            locationId: data?.locationId ?? null,
            councilMeetingId: meetingId,
            cityId,
        },
    })
}

export async function createNotificationPreference(params: { userId: string; cityId: string; locationIds?: string[]; topicIds?: string[] }) {
    const { userId, cityId, locationIds = [], topicIds = [] } = params

    // Create base preference or update existing to connect relations
    const existing = await prisma.notificationPreference.findUnique({ where: { userId_cityId: { userId, cityId } } })
    
    if (existing) {
        await prisma.notificationPreference.update({
            where: { id: existing.id },
            data: {
                locations: { set: locationIds.map((id) => ({ id })) },
                interests: { set: topicIds.map((id) => ({ id })) },
            },
        })
        return prisma.notificationPreference.findUnique({
            where: { id: existing.id },
            include: { locations: true, interests: true },
        })
    }

    // Create new preference using UncheckedCreateInput to avoid relation issues
    const pref = await prisma.notificationPreference.create({
        data: {
            userId,
            cityId,
            locations: locationIds.length > 0 ? { connect: locationIds.map((id) => ({ id })) } : undefined,
            interests: topicIds.length > 0 ? { connect: topicIds.map((id) => ({ id })) } : undefined,
        },
    })

    return prisma.notificationPreference.findUnique({
        where: { id: pref.id },
        include: { locations: true, interests: true },
    })
}

export function metersToLatLngOffset(lat: number, dxMeters: number, dyMeters: number): { dLng: number; dLat: number } {
    const metersPerDegLat = 111320
    const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
    const dLat = dyMeters / metersPerDegLat
    const dLng = dxMeters / metersPerDegLng
    return { dLng, dLat }
}


