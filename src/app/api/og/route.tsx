import { ImageResponse } from 'next/og';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity } from '@/lib/db/cities';
import { getCouncilMeetingsCountForCity } from '@/lib/db/meetings';
import { getConsultationDataForOG } from '@/lib/db/consultations';
import { RegulationData } from '@/components/consultations/types';
import prisma from '@/lib/db/prisma';
import { getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity, getPerson } from '@/lib/db/people';
import { sortSubjectsByImportance } from '@/lib/utils';
import { Container, OgHeader, OpenCouncilWatermark } from '@/components/og/shared-components';
import { getSubjectDataForOG } from '@/lib/db/subject';

// Meeting OG Image (Landscape - 1200x630)
const MeetingOGImage = async (cityId: string, meetingId: string) => {
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) return null;

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Sort subjects by importance (hot subjects first, then by speaking time)
    const sortedSubjects = sortSubjectsByImportance(data.subjects);
    const topSubjects = sortedSubjects.slice(0, 3);
    const remainingCount = Math.max(0, data.subjects.length - 3);

    return (
        <Container>
            <OgHeader
                city={{
                    name: data.city.name_municipality,
                    logoImage: data.city.logoImage
                }}
            />

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingTop: '8px',
            }}>
                <h1 style={{
                    fontSize: 56,
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
                    fontSize: 28,
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
                                fontSize: 22,
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
                                fontSize: 18,
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

// Meeting Story OG Image (Vertical - 1080x1920 for Instagram Stories)
const MeetingStoryOGImage = async (cityId: string, meetingId: string) => {
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) return null;

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Sort subjects by importance (hot subjects first, then by speaking time)
    const sortedSubjects = sortSubjectsByImportance(data.subjects);
    const topSubjects = sortedSubjects.slice(0, 5);
    const remainingCount = Math.max(0, data.subjects.length - 5);

    return (
        <div
            style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#ffffff',
                padding: '64px 48px',
                position: 'relative',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                marginBottom: '48px',
            }}>
                {data.city.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={data.city.logoImage}
                        height="100"
                        alt="City Logo"
                        style={{
                            objectFit: 'contain',
                        }}
                    />
                )}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}>
                    <span style={{
                        fontSize: 36,
                        fontWeight: 600,
                        color: '#1f2937',
                        display: 'flex',
                    }}>
                        {data.city.name_municipality}
                    </span>
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '32px',
            }}>
                <h1 style={{
                    fontSize: 72,
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.2,
                    margin: 0,
                    maxWidth: '100%',
                }}>
                    {data.name}
                </h1>

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    color: '#4b5563',
                    fontSize: 32,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    }}>
                        <span>📅</span>
                        <span>{formattedDate}</span>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    }}>
                        <span>📋</span>
                        <span>{data.subjects?.length || 0} Θέματα</span>
                    </div>
                </div>

                {topSubjects.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        marginTop: '24px',
                    }}>
                        {topSubjects.map((subject) => (
                            <div key={subject.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                backgroundColor: subject.topic?.colorHex || '#e5e7eb',
                                padding: '16px 24px',
                                borderRadius: '16px',
                                color: '#ffffff',
                                fontSize: 28,
                                fontWeight: 600,
                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                width: '100%',
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
                                gap: '8px',
                                color: '#6b7280',
                                fontSize: 24,
                                marginTop: '8px',
                            }}>
                                <span style={{
                                    display: 'flex'
                                }}>+{remainingCount} ακόμα θέματα</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Watermark */}
            <OpenCouncilWatermark />
        </div>
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
                        background: city.officialSupport
                            ? 'linear-gradient(to right, #fc550a, #a4c0e1)'
                            : '#f3f4f6',
                        color: city.officialSupport ? '#ffffff' : '#6b7280',
                        padding: '8px 16px',
                        borderRadius: '9999px',
                        fontSize: 16,
                        fontWeight: 500,
                        marginTop: '8px',
                        alignSelf: 'flex-start',
                        border: city.officialSupport ? 'none' : '1px solid #e5e7eb'
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

// Consultation OG Image
const ConsultationOGImage = async (cityId: string, consultationId: string) => {
    // Helper function to fetch regulation data
    const fetchRegulationData = async (jsonUrl: string): Promise<RegulationData | null> => {
        try {
            const response = await fetch(jsonUrl, { cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error fetching regulation data:', error);
            return null;
        }
    };

    // Fetch consultation data with city info and comment count
    const consultationData = await getConsultationDataForOG(cityId, consultationId);

    if (!consultationData) return null;

    // Fetch regulation data
    const regulationData = await fetchRegulationData(consultationData.jsonUrl);

    // Calculate statistics
    const chaptersCount = regulationData?.regulation?.filter(item => item.type === 'chapter').length || 0;
    const geosetsCount = regulationData?.regulation?.filter(item => item.type === 'geoset').length || 0;
    const commentsCount = consultationData._count.comments;

    // Note: Removed date display to keep the layout clean

    return (
        <Container>
            <OgHeader
                city={{
                    name: consultationData.city.name_municipality,
                    logoImage: consultationData.city.logoImage
                }}
            />

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingTop: '8px',
            }}>
                {/* Consultation Badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    padding: '10px 20px',
                    borderRadius: '9999px',
                    fontSize: 20,
                    fontWeight: 600,
                    alignSelf: 'flex-start',
                    marginBottom: '8px',
                }}>
                    <span>💬</span>
                    <span>Δημόσια Διαβούλευση</span>
                </div>

                {/* Title */}
                <h1 style={{
                    fontSize: 44,
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.2,
                    margin: 0,
                    maxWidth: '95%',
                    marginBottom: '24px',
                }}>
                    {regulationData?.title || consultationData.name}
                </h1>



                {/* Key highlights */}
                {regulationData?.regulation && chaptersCount > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}>
                        <div style={{
                            fontSize: 20,
                            fontWeight: 600,
                            color: '#374151',
                            marginBottom: '4px',
                        }}>
                            Κύρια Θέματα:
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                        }}>
                            {regulationData.regulation
                                .filter(item => item.type === 'chapter')
                                .slice(0, 3)
                                .map((chapter, index) => (
                                    <div key={chapter.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        backgroundColor: '#e0f2fe',
                                        color: '#0369a1',
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        fontSize: 16,
                                        fontWeight: 500,
                                        maxWidth: '300px',
                                    }}>
                                        <span style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {chapter.num ? `${chapter.num}. ` : ''}{chapter.title?.substring(0, 40) || 'Άτιτλο Κεφάλαιο'}{chapter.title && chapter.title.length > 40 ? '...' : ''}
                                        </span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
            </div>
        </Container>
    );
};

// Person OG Image
const PersonOGImage = async (cityId: string, personId: string) => {
    const [person, city, parties] = await Promise.all([
        getPerson(personId),
        getCity(cityId),
        getPartiesForCity(cityId)
    ]);

    if (!person || !city) return null;

    // Find the person's current party
    const currentRole = person.roles.find(role => {
        const now = new Date();
        return (!role.startDate || role.startDate <= now) &&
            (!role.endDate || role.endDate > now);
    });

    const currentParty = currentRole?.party;

    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '48px',
            }}>
                {/* Person Avatar or Initials */}
                <div style={{
                    width: '160px',
                    height: '160px',
                    borderRadius: '80px',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '64px',
                    fontWeight: 'bold',
                    color: '#6b7280',
                    border: '4px solid #e5e7eb',
                }}>
                    {person.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={person.image}
                            alt={person.name}
                            width="160"
                            height="160"
                            style={{ borderRadius: '80px', objectFit: 'cover' }}
                        />
                    ) : (
                        person.name.split(' ').map(n => n[0]).join('').toUpperCase()
                    )}
                </div>

                {/* Person Info */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}>
                    <div style={{
                        fontSize: '48px',
                        fontWeight: 'bold',
                        color: '#1f2937',
                        lineHeight: 1.2,
                    }}>
                        {person.name}
                    </div>

                    {currentParty && (
                        <div style={{
                            fontSize: '24px',
                            color: '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '4px',
                                backgroundColor: currentParty.colorHex || '#6b7280',
                            }} />
                            {currentParty.name}
                        </div>
                    )}

                    <div style={{
                        fontSize: '20px',
                        color: '#9ca3af',
                    }}>
                        {city.name} • Δημοτικό Συμβούλιο
                    </div>
                </div>
            </div>
        </Container>
    );
};

// People List OG Image  
const PeopleOGImage = async (cityId: string) => {
    const [city, people, parties] = await Promise.all([
        getCity(cityId),
        getPeopleForCity(cityId),
        getPartiesForCity(cityId)
    ]);

    if (!city) return null;

    // Get first 6 people for display
    const displayPeople = people.slice(0, 6);

    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '32px',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                }}>
                    {city.logoImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={city.logoImage}
                            alt={city.name}
                            width="80"
                            height="80"
                            style={{ objectFit: 'contain' }}
                        />
                    )}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        <div style={{
                            fontSize: '36px',
                            fontWeight: 'bold',
                            color: '#1f2937',
                        }}>
                            Δημοτικοί Σύμβουλοι
                        </div>
                        <div style={{
                            fontSize: '24px',
                            color: '#6b7280',
                        }}>
                            {city.name} • {people.length} σύμβουλοι
                        </div>
                    </div>
                </div>

                {/* People Grid */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}>
                    {displayPeople.map((person, index) => (
                        <div key={person.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                        }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '20px',
                                backgroundColor: '#e5e7eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                color: '#6b7280',
                            }}>
                                {person.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={person.image}
                                        alt={person.name}
                                        width="40"
                                        height="40"
                                        style={{ borderRadius: '20px', objectFit: 'cover' }}
                                    />
                                ) : (
                                    person.name.split(' ').map(n => n[0]).join('').toUpperCase()
                                )}
                            </div>
                            <div style={{
                                fontSize: '18px',
                                color: '#1f2937',
                                fontWeight: '500',
                            }}>
                                {person.name.length > 20 ? person.name.substring(0, 20) + '...' : person.name}
                            </div>
                        </div>
                    ))}
                </div>

                {people.length > 6 && (
                    <div style={{
                        fontSize: '16px',
                        color: '#9ca3af',
                        textAlign: 'center',
                    }}>
                        και {people.length - 6} ακόμα...
                    </div>
                )}
            </div>
        </Container>
    );
};

// About Page OG Image
const AboutOGImage = () => {
    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '32px',
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: '64px',
                    fontWeight: 'bold',
                    color: '#1f2937',
                }}>
                    OpenCouncil
                </div>

                <div style={{
                    fontSize: '32px',
                    color: '#6b7280',
                    maxWidth: '800px',
                    lineHeight: 1.4,
                }}>
                    Χρησιμοποιούμε τεχνητή νοημοσύνη για να παρακολουθούμε τα δημοτικά συμβούλια και να τα κάνουμε απλά και κατανοητά
                </div>

                <div style={{
                    display: 'flex',
                    gap: '24px',
                    alignItems: 'center',
                    fontSize: '18px',
                    color: '#9ca3af',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🎯 Διαφάνεια
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🤖 Τεχνητή Νοημοσύνη
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏛️ Δημοκρατία
                    </div>
                </div>
            </div>
        </Container>
    );
};

// Search Page OG Image
const SearchOGImage = () => {
    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '32px',
                textAlign: 'center',
            }}>
                <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '60px',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                }}>
                    🔍
                </div>

                <div style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#1f2937',
                }}>
                    Αναζήτηση
                </div>

                <div style={{
                    fontSize: '24px',
                    color: '#6b7280',
                    maxWidth: '600px',
                    lineHeight: 1.4,
                }}>
                    Βρείτε αναφορές σε θέματα, τοποθετήσεις συμβούλων και στατιστικά από όλα τα δημοτικά συμβούλια
                </div>

                <div style={{
                    fontSize: '18px',
                    color: '#9ca3af',
                }}>
                    OpenCouncil • Έξυπνη Αναζήτηση
                </div>
            </div>
        </Container>
    );
};

// Chat Page OG Image
const ChatOGImage = () => {
    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '32px',
                textAlign: 'center',
            }}>
                <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '60px',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                }}>
                    🤖
                </div>

                <div style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#1f2937',
                }}>
                    OpenCouncil AI
                </div>

                <div style={{
                    fontSize: '24px',
                    color: '#6b7280',
                    maxWidth: '600px',
                    lineHeight: 1.4,
                }}>
                    Συνομιλήστε με την τεχνητή νοημοσύνη για να μάθετε για δημοτικά συμβούλια και θέματα πολιτικής
                </div>

                <div style={{
                    fontSize: '18px',
                    color: '#9ca3af',
                }}>
                    OpenCouncil • Powered by AI
                </div>
            </div>
        </Container>
    );
};

// Subject OG Image
const SubjectOGImage = async (cityId: string, meetingId: string, subjectId: string) => {
    const data = await getSubjectDataForOG(cityId, meetingId, subjectId);

    if (!data) return null;

    // Use the same calculation as the subject page - from statistics
    const totalMinutes = Math.round(data.statistics?.speakingSeconds ? data.statistics.speakingSeconds / 60 : 0);

    // Get top speaker IDs from statistics
    const topSpeakersIds =
        data.statistics?.people?.sort((a, b) => b.speakingSeconds - a.speakingSeconds).map(p => p.item.id) || [];

    // Add the introducer at the start if they exist and aren't already in top speakers
    const introducedByPerson = data.subject.introducedBy;
    if (introducedByPerson && !topSpeakersIds.includes(introducedByPerson.id)) {
        topSpeakersIds.unshift(introducedByPerson.id);
    }

    // Filter and sort to get top speakers (limit to first 4 for space)
    const topSpeakers = topSpeakersIds
        .map(id => data.people.find(p => p.id === id))
        .filter((p): p is any => p !== undefined)
        .slice(0, 4);

    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '32px',
            }}>
                {/* Header with city and meeting info */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                }}>
                    {data.city.logoImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={data.city.logoImage}
                            alt={data.city.name}
                            width="80"
                            height="80"
                            style={{ objectFit: 'contain' }}
                        />
                    )}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        <div style={{
                            fontSize: '24px',
                            color: '#6b7280',
                            display: 'flex',
                        }}>
                            {data.city.name}
                        </div>
                        <div style={{
                            fontSize: '20px',
                            color: '#9ca3af',
                            display: 'flex',
                        }}>
                            {data.meeting.name}
                        </div>
                    </div>
                </div>

                {/* Subject title */}
                <div style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#1f2937',
                    lineHeight: 1.2,
                    paddingRight: '120px', // Make room for statistics
                    display: 'flex',
                }}>
                    {data.subject.name}
                </div>

                {/* Topic and location badges */}
                <div style={{
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                }}>
                    {/* Topic badge */}
                    {data.subject.topic && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: data.subject.topic.colorHex || '#e5e7eb',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '18px',
                            fontWeight: '600',
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#ffffff',
                                display: 'flex',
                            }} />
                            <span style={{ display: 'flex' }}>{data.subject.topic.name}</span>
                        </div>
                    )}

                    {/* Location badge */}
                    {data.subject.location && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#f3f4f6',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#4b5563',
                            fontSize: '18px',
                            fontWeight: '500',
                        }}>
                            <span style={{ display: 'flex' }}>📍</span>
                            <span style={{ display: 'flex' }}>{data.subject.location.text}</span>
                        </div>
                    )}
                </div>

                {/* Speaking time and speakers */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '32px',
                }}>
                    {/* Speaking time */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <div style={{
                            fontSize: '36px',
                            fontWeight: 'bold',
                            color: '#1f2937',
                            display: 'flex',
                        }}>
                            {totalMinutes}
                        </div>
                        <div style={{
                            fontSize: '16px',
                            color: '#6b7280',
                            display: 'flex',
                        }}>
                            λεπτά συζήτησης
                        </div>
                    </div>

                    {/* Top speakers */}
                    {topSpeakers.length > 0 && (
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                        }}>
                            {topSpeakers.map((person, index) => {
                                // Find party from roles
                                const currentRole = person.roles?.find((role: any) => {
                                    const now = new Date();
                                    return (!role.startDate || role.startDate <= now) &&
                                        (!role.endDate || role.endDate > now);
                                });
                                const partyColor = currentRole?.party?.colorHex || '#e5e7eb';

                                // Get initials
                                const nameParts = person.name.split(' ');
                                const initials = nameParts.length > 1
                                    ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`
                                    : person.name.substring(0, 2).toUpperCase();

                                const isIntroducer = introducedByPerson && person.id === introducedByPerson.id;

                                return (
                                    <div key={person.id} style={{
                                        position: 'relative',
                                        display: 'flex',
                                    }}>
                                        <div style={{
                                            width: '60px',
                                            height: '60px',
                                            borderRadius: '30px',
                                            backgroundColor: '#ffffff',
                                            border: `3px solid ${partyColor}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '20px',
                                            fontWeight: 'bold',
                                            color: partyColor,
                                        }}>
                                            {person.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={person.image}
                                                    alt={person.name}
                                                    width="60"
                                                    height="60"
                                                    style={{ borderRadius: '30px', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <span style={{ display: 'flex' }}>{initials}</span>
                                            )}
                                        </div>
                                        {isIntroducer && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '-6px',
                                                right: '-6px',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '12px',
                                                backgroundColor: '#ffffff',
                                                border: '2px solid #ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '12px',
                                            }}>
                                                ✏️
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {topSpeakersIds.length > 4 && (
                                <div style={{
                                    fontSize: '16px',
                                    color: '#6b7280',
                                    display: 'flex',
                                }}>
                                    +{topSpeakersIds.length - 4} ακόμα
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Container>
    );
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');
    const consultationId = searchParams.get('consultationId');
    const personId = searchParams.get('personId');
    const subjectId = searchParams.get('subjectId');
    const pageType = searchParams.get('pageType'); // 'people', 'about', 'search', 'chat'
    const variant = searchParams.get('variant'); // 'story' for 9:16, 'feed' for 1:1, default is landscape

    try {
        let element;
        let width = 1200;
        let height = 630;

        if (consultationId && cityId) {
            element = await ConsultationOGImage(cityId, consultationId);
        } else if (subjectId && meetingId && cityId) {
            // Subject-specific OG image
            element = await SubjectOGImage(cityId, meetingId, subjectId);
        } else if (meetingId && cityId) {
            // Handle variant for meeting images
            if (variant === 'story') {
                element = await MeetingStoryOGImage(cityId, meetingId);
                width = 1080;
                height = 1920;
            } else if (variant === 'feed') {
                // Square format for feed posts
                element = await MeetingOGImage(cityId, meetingId);
                width = 1080;
                height = 1080;
            } else {
                // Default landscape format
                element = await MeetingOGImage(cityId, meetingId);
            }
        } else if (personId && cityId) {
            element = await PersonOGImage(cityId, personId);
        } else if (pageType === 'people' && cityId) {
            element = await PeopleOGImage(cityId);
        } else if (pageType === 'about') {
            element = AboutOGImage();
        } else if (pageType === 'search') {
            element = SearchOGImage();
        } else if (pageType === 'chat') {
            element = ChatOGImage();
        } else if (cityId) {
            element = await CityOGImage(cityId);
        } else {
            return new Response('Missing required parameters', { status: 400 });
        }

        if (!element) {
            return new Response('Not found', { status: 404 });
        }

        return new ImageResponse(element, {
            width,
            height,
        });
    } catch (e) {
        console.error(e);
        return new Response('Failed to generate image', { status: 500 });
    }
}