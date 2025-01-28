import { ImageResponse } from 'next/og';
import { getMeetingData } from '@/lib/getMeetingData';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const cityId = searchParams.get('cityId');

    if (!meetingId || !cityId) {
        return new Response('Missing meetingId or cityId', { status: 400 });
    }

    try {
        const data = await getMeetingData(cityId, meetingId);

        if (!data) {
            return new Response('Meeting not found', { status: 404 });
        }

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#fff',
                        padding: '40px 60px',
                        position: 'relative',
                    }}
                >
                    {/* Logo */}
                    <div style={{
                        position: 'absolute',
                        top: 40,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <span style={{
                            fontSize: 32,
                            fontWeight: 700,
                            color: '#000',
                        }}>
                            OpenCouncil
                        </span>
                    </div>

                    {/* Main Content */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 60,
                            marginBottom: 20,
                        }}
                    >
                        <h1
                            style={{
                                fontSize: 60,
                                fontWeight: 800,
                                color: '#000',
                                lineHeight: 1.2,
                                textAlign: 'center',
                            }}
                        >
                            {data.meeting.name}
                        </h1>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 40,
                            fontWeight: 600,
                            color: '#000',
                            marginTop: 10,
                        }}
                    >
                        {data.city.name}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 30,
                            color: '#000',
                            marginTop: 10,
                        }}
                    >
                        {new Date(data.meeting.dateTime).toLocaleDateString()}
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            },
        );
    } catch (e) {
        console.error(e);
        return new Response('Failed to generate image', { status: 500 });
    }
} 
