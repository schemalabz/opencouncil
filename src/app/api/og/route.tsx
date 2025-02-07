import { ImageResponse } from 'next/og';
import { getMeetingData } from '@/lib/getMeetingData';
import fs from 'fs';
import path from 'path';

// Load and convert the logo to base64
const logoPath = path.join(process.cwd(), 'public', 'logo.png');
const logo = fs.readFileSync(logoPath);
const logoBase64 = `data:image/png;base64,${logo.toString('base64')}`;

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
                        backgroundColor: '#fff',
                        padding: '60px',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        marginBottom: 80,
                    }}>
                        {/* Logo and name */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px'
                        }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={logoBase64}
                                width="120"
                                height="120"
                                alt="OpenCouncil Logo"
                            />
                            <span style={{
                                fontSize: 42,
                                fontWeight: 700,
                                color: '#000',
                            }}>
                                OpenCouncil
                            </span>
                        </div>

                        {/* City name */}
                        <div style={{
                            fontSize: 64,
                            fontWeight: 600,
                            color: '#000',
                        }}>
                            {data.city.name}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                        }}
                    >
                        <h1
                            style={{
                                fontSize: 72,
                                fontWeight: 800,
                                color: '#000',
                                lineHeight: 1.2,
                                textAlign: 'center',
                                maxWidth: '90%',
                            }}
                        >
                            {data.meeting.name}
                        </h1>
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
