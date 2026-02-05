import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { uploadFile } from '@/lib/s3'
import { deleteCity, editCity, getCity } from '@/lib/db/cities'
import { upsertCityMessage, deleteCityMessage } from '@/lib/db/cityMessages'
import { isUserAuthorizedToEdit, getCurrentUser } from '@/lib/auth'
import { updateCityFormDataSchema } from '@/lib/zod-schemas/city'
import { parseFormData } from '@/lib/api/form-data-parser'
import { CityUpdateData } from '@/lib/db/types/city'

export async function GET(request: Request, { params }: { params: { cityId: string } }) {
    const city = await getCity(params.cityId, { includeGeometry: true });

    if (!city) {
        return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    console.log('API returning city with geometry:', city);

    return NextResponse.json(city);
}

export async function PUT(request: Request, { params }: { params: { cityId: string } }) {
    const authorizedToEdit = await isUserAuthorizedToEdit({ cityId: params.cityId })
    if (!authorizedToEdit) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if user is superadmin (required for officialSupport and status changes)
    const currentUser = await getCurrentUser()
    const isSuperAdmin = currentUser?.isSuperAdmin ?? false

    try {
        const formData = await request.formData();
        const data = await parseFormData(formData, updateCityFormDataSchema);

        // CityMessage is a separate entity, parsed manually and handled after city update
        const hasMessage = formData.get('hasMessage') === 'true'
        const messageEmoji = formData.get('messageEmoji') as string | null
        const messageTitle = formData.get('messageTitle') as string | null
        const messageDescription = formData.get('messageDescription') as string | null
        const messageCallToActionText = formData.get('messageCallToActionText') as string | null
        const messageCallToActionUrl = formData.get('messageCallToActionUrl') as string | null
        const messageCallToActionExternal = formData.get('messageCallToActionExternal') === 'true'
        const messageIsActive = formData.get('messageIsActive') === 'true'

        // Upload logo if provided
        let logoImageUrl: string | undefined = undefined
        if (data.logoImage) {
            try {
                const result = await uploadFile(data.logoImage, { prefix: 'city-logos' })
                logoImageUrl = result.url
            } catch (error) {
                console.error('Error uploading file:', error)
                return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
            }
        }

        // Build update data
        const updateData: CityUpdateData = {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.name_en !== undefined && { name_en: data.name_en }),
            ...(data.name_municipality !== undefined && { name_municipality: data.name_municipality }),
            ...(data.name_municipality_en !== undefined && { name_municipality_en: data.name_municipality_en }),
            ...(data.timezone !== undefined && { timezone: data.timezone }),
            ...(logoImageUrl !== undefined && { logoImage: logoImageUrl }),
            ...(data.authorityType !== undefined && { authorityType: data.authorityType }),
            ...(data.supportsNotifications !== undefined && { supportsNotifications: data.supportsNotifications }),
            ...(data.consultationsEnabled !== undefined && { consultationsEnabled: data.consultationsEnabled }),
            ...(data.peopleOrdering !== undefined && { peopleOrdering: data.peopleOrdering }),
            ...(data.highlightCreationPermission !== undefined && { highlightCreationPermission: data.highlightCreationPermission }),
            ...(data.diavgeiaUid !== undefined && { diavgeiaUid: data.diavgeiaUid }),
        }

        // Only include admin-only fields if user is superadmin
        if (isSuperAdmin) {
            if (data.officialSupport !== undefined) {
                updateData.officialSupport = data.officialSupport
            }
            if (data.status !== undefined) {
                updateData.status = data.status
            }
        }

        const city = await editCity(params.cityId, updateData);

        // Handle message operations
        try {
            if (hasMessage && messageEmoji && messageTitle && messageDescription) {
                // Upsert message (create or update - overwrites existing)
                await upsertCityMessage(params.cityId, {
                    emoji: messageEmoji,
                    title: messageTitle,
                    description: messageDescription,
                    callToActionText: messageCallToActionText || null,
                    callToActionUrl: messageCallToActionUrl || null,
                    callToActionExternal: messageCallToActionExternal,
                    isActive: messageIsActive
                });
            } else if (!hasMessage) {
                // Delete message if hasMessage is false
                await deleteCityMessage(params.cityId);
            }
        } catch (error) {
            console.error('Error handling city message:', error);
            // Don't return error here, as city was updated successfully
            // Just log the message operation failure
        }

        // Revalidate cache after successful operations
        try {
            revalidateTag(`city:${params.cityId}:basic`);
            revalidateTag(`city:${params.cityId}:message`);
            revalidatePath(`/${params.cityId}`, "layout");
        } catch (error) {
            console.error('Error revalidating cache:', error);
            // Don't return error here, as the main operations were successful
        }

        return NextResponse.json(city);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.errors },
                { status: 400 }
            );
        }
        console.error('Error updating city:', error);
        return NextResponse.json({ error: 'Failed to update city' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: { cityId: string } }) {
    const authorizedToDelete = await isUserAuthorizedToEdit({})
    if (!authorizedToDelete) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    await deleteCity(params.cityId);
    return NextResponse.json({ message: 'City deleted successfully' })
}