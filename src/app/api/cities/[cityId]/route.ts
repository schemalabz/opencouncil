import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { deleteCity, editCity, getCity, getCitiesWithGeometry } from '@/lib/db/cities'
import { upsertCityMessage, deleteCityMessage } from '@/lib/db/cityMessages'
import { isUserAuthorizedToEdit } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: { cityId: string } }) {
    const city = await getCity(params.cityId);

    if (!city) {
        return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    // Get the city with geometry
    const citiesWithGeometry = await getCitiesWithGeometry([city]);
    const cityWithGeometry = citiesWithGeometry[0];

    console.log('API returning city with geometry:', cityWithGeometry);

    return NextResponse.json(cityWithGeometry);
}

export async function PUT(request: Request, { params }: { params: { cityId: string } }) {
    const authorizedToEdit = await isUserAuthorizedToEdit({ cityId: params.cityId })
    if (!authorizedToEdit) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    const formData = await request.formData()
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_municipality = formData.get('name_municipality') as string
    const name_municipality_en = formData.get('name_municipality_en') as string
    const timezone = formData.get('timezone') as string
    const logoImage = formData.get('logoImage') as File | null
    const authorityType = (formData.get('authorityType') as 'municipality' | 'region') || 'municipality'
    const officialSupport = formData.get('officialSupport') === 'true'
    const isListed = formData.get('isListed') === 'true'
    const isPending = formData.get('isPending') === 'true'

    // Message data
    const hasMessage = formData.get('hasMessage') === 'true'
    const messageEmoji = formData.get('messageEmoji') as string | null
    const messageTitle = formData.get('messageTitle') as string | null
    const messageDescription = formData.get('messageDescription') as string | null
    const messageCallToActionText = formData.get('messageCallToActionText') as string | null
    const messageCallToActionUrl = formData.get('messageCallToActionUrl') as string | null
    const messageCallToActionExternal = formData.get('messageCallToActionExternal') === 'true'
    const messageIsActive = formData.get('messageIsActive') === 'true'

    let logoImageUrl: string | undefined = undefined

    if (logoImage) {
        try {
            const result = await uploadFile(logoImage, { prefix: 'city-logos' })
            logoImageUrl = result.url
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    let city;
    
    // Update city data
    try {
        city = await editCity(params.cityId, {
            name,
            name_en,
            name_municipality,
            name_municipality_en,
            timezone,
            ...(logoImageUrl && { logoImage: logoImageUrl }),
            authorityType,
            officialSupport,
            isListed,
            isPending
        });
    } catch (error) {
        console.error('Error updating city:', error);
        return NextResponse.json({ error: 'Failed to update city' }, { status: 500 });
    }

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

    return NextResponse.json(city)
}

export async function DELETE(request: Request, { params }: { params: { cityId: string } }) {
    const authorizedToDelete = await isUserAuthorizedToEdit({})
    if (!authorizedToDelete) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    await deleteCity(params.cityId);
    return NextResponse.json({ message: 'City deleted successfully' })
}