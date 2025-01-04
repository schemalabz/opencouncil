import { NextResponse } from 'next/server';
import { getMeetingData } from '@/lib/getMeetingData';
import { getCities } from '@/lib/db/cities';
import { getCouncilMeetingsForCity } from '@/lib/db/meetings';

export async function generateStaticParams() {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId }));
}

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const data = await getMeetingData(params.cityId, params.meetingId);
    return NextResponse.json({ ...data });
}