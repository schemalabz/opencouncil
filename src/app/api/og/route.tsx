import { ImageResponse } from 'next/og';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity } from '@/lib/db/cities';
import { getCouncilMeetingsCountForCity } from '@/lib/db/meetings';
import prisma from '@/lib/db/prisma';
import { getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity } from '@/lib/db/people';
import { sortSubjectsByImportance } from '@/lib/utils';
import fs from 'fs';
import path from 'path';

// Load and convert the logo to base64
const logoPath = path.join(process.cwd(), 'public', 'logo.png');
const logo = fs.readFileSync(logoPath);
const logoBase64 = `data:image/png;base64,${logo.toString('base64')}`;

// Shared components
const OpenCouncilWatermark = () => (
    <div style={{
        position: 'absolute',
        bottom: 40,
        right: 40,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        opacity: 0.7,
    }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            src={logoBase64}
            width="20"
            height="20"
            alt="OpenCouncil"
        />
        <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#6b7280',
        }}>
            OpenCouncil
        </span>
    </div>
);

const Container = ({ children }: { children: React.ReactNode }) => (
    <div style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: '48px',
        position: 'relative',
    }}>
        {children}
        <OpenCouncilWatermark />
    </div>
);

// Meeting OG Image
const MeetingOGImage = async (cityId: string, meetingId: string) => {
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) return null;

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Sort subjects by hotness
    const sortedSubjects = [...data.subjects].sort((a, b) => {
        if (a.hot && !b.hot) return -1;
        if (!a.hot && b.hot) return 1;
        return 0;
    });
    const topSubjects = sortedSubjects.slice(0, 3);
    const remainingCount = Math.max(0, data.subjects.length - 3);

    return (
        <Container>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                marginBottom: 32,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px'
                }}>
                    {data.city.logoImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={data.city.logoImage}
                            height="80"
                            alt="City Logo"
                            style={{
                                objectFit: 'contain',
                            }}
                        />
                    )}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{
                            fontSize: 28,
                            fontWeight: 600,
                            color: '#1f2937',
                        }}>
                            {data.city.name_municipality}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingTop: '8px',
            }}>
                <h1 style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.3,
                    margin: 0,
                    maxWidth: '95%',
                }}>
                    {data.name}
                </h1>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    color: '#4b5563',
                    fontSize: 22,
                    marginTop: '8px',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <span>📅</span>
                        <span>{formattedDate}</span>
                    </div>

                    <div style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#9ca3af',
                    }} />

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <span>📋</span>
                        <span>{data.subjects?.length || 0} Θέματα</span>
                    </div>
                </div>

                {topSubjects.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginTop: '16px',
                    }}>
                        {topSubjects.map((subject) => (
                            <div key={subject.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: subject.topic?.colorHex || '#e5e7eb',
                                padding: '10px 20px',
                                borderRadius: '9999px',
                                color: '#ffffff',
                                fontSize: 18,
                                fontWeight: 600,
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                maxWidth: '85%',
                            }}>
                                <span style={{
                                    display: 'flex',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>{subject.name}</span>
                            </div>
                        ))}
                        {remainingCount > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#6b7280',
                                fontSize: 16,
                                marginTop: '4px',
                            }}>
                                <span style={{
                                    display: 'flex'
                                }}>+{remainingCount} ακόμα θέματα</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Container>
    );
};

// City OG Image
const CityOGImage = async (cityId: string) => {
    // Fetch only the data we need in parallel
    const [city, meetingsCount, counts] = await Promise.all([
        getCity(cityId),
        getCouncilMeetingsCountForCity(cityId),
        prisma.$transaction([
            prisma.person.count({ where: { cityId } }),
            prisma.party.count({ where: { cityId } })
        ])
    ]);

    if (!city) return null;

    const [peopleCount, partiesCount] = counts;

    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '48px',
            }}>
                {/* City Logo */}
                <div style={{
                    width: '160px',
                    height: '160px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {city.logoImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={city.logoImage}
                            height="160"
                            alt={`${city.name} logo`}
                            style={{
                                objectFit: 'contain',
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '160px',
                            height: '160px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontSize: '64px',
                        }}>
                            🏛️
                        </div>
                    )}
                </div>

                {/* City Info */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    flex: 1,
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                    }}>
                        <h1 style={{
                            fontSize: 64,
                            fontWeight: 500,
                            color: '#111827',
                            margin: 0,
                            lineHeight: 1.2,
                        }}>
                            {city.name}
                        </h1>
                        <div style={{
                            display: 'flex',
                            fontSize: 24,
                            color: '#6b7280',
                        }}>
                            {meetingsCount} καταγεγραμμένες συνεδριάσεις
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{
                        display: 'flex',
                        gap: '32px',
                        marginTop: '8px',
                    }}>
                        {[
                            { value: meetingsCount, label: 'Συνεδριάσεις' },
                            { value: peopleCount, label: 'Μέλη' },
                            { value: partiesCount, label: 'Παρατάξεις' }
                        ].map(({ value, label }) => (
                            <div key={label} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 36,
                                    fontWeight: 600,
                                    color: '#111827',
                                }}>
                                    {value}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 18,
                                    color: '#6b7280',
                                }}>
                                    {label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Official Support Badge */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: city.officialSupport ? '#dcfce7' : '#f3f4f6',
                        color: city.officialSupport ? '#166534' : '#6b7280',
                        padding: '8px 16px',
                        borderRadius: '9999px',
                        fontSize: 16,
                        fontWeight: 500,
                        marginTop: '8px',
                        alignSelf: 'flex-start'
                    }}>
                        <span style={{
                            display: 'flex'
                        }}>
                            {city.officialSupport
                                ? `Με την υποστήριξη ${city.authorityType === 'municipality' ? 'του δήμου' : 'της περιφέρειας'}`
                                : `Χωρίς επίσημη υποστήριξη ${city.authorityType === 'municipality' ? 'του δήμου' : 'της περιφέρειας'}`
                            }
                        </span>
                    </div>
                </div>
            </div>
        </Container>
    );
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');

    try {
        let element;
        if (meetingId && cityId) {
            element = await MeetingOGImage(cityId, meetingId);
        } else if (cityId) {
            element = await CityOGImage(cityId);
        } else {
            return new Response('Missing required parameters', { status: 400 });
        }

        if (!element) {
            return new Response('Not found', { status: 404 });
        }

        return new ImageResponse(element, {
            width: 1200,
            height: 630,
        });
    } catch (e) {
        console.error(e);
        return new Response('Failed to generate image', { status: 500 });
    }
} 
