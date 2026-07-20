// Import directly from @vercel/og rather than next/og: Next 14.2 ships an older
// vendored @vercel/og@0.6.3 (satori@0.10.9) which has known runaway-CPU + memory
// leaks (vercel/next.js#65451, satori#393/#532). The standalone package at 0.11.1
// ships satori@0.25 with those fixes.
import { ImageResponse } from '@vercel/og';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity } from '@/lib/db/cities';
import { getConsultationDataForOG } from '@/lib/db/consultations';
import { RegulationData } from '@/components/consultations/types';
import prisma from '@/lib/db/prisma';
import { getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity, getPerson } from '@/lib/db/people';
import { getInitials } from '@/lib/formatters/name';
import { sortSubjectsByImportance } from '@/lib/utils';
import { Container, MeetingMetaRow, OgHeader, SubjectPills, formatCityDisplayName } from '@/components/og/shared-components';
import { tryAcquireOgSlot, getOgConcurrencyStats } from '@/lib/og/concurrency';
import { LOGO_BLACK_DATA_URI } from '@/lib/og/serverAssets';
import SubjectOgImage from '@/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/subjects/[subjectId]/opengraph-image';

// Hard ceiling on each render. Pairs with the in-process concurrency cap in
// `@/lib/og/concurrency` to keep a single hung satori call from blocking a slot forever.
export const maxDuration = 60;

// Logs subject counts split by agenda status so we can see whether "many subjects"
// (especially many beforeAgenda) is amplifying the work in a given render.
function logSubjectCounts(reqId: string, variant: string, subjects: { nonAgendaReason?: string | null }[], fetchMs: number) {
    const beforeAgenda = subjects.filter(s => s.nonAgendaReason === 'beforeAgenda').length;
    const outOfAgenda = subjects.filter(s => s.nonAgendaReason && s.nonAgendaReason !== 'beforeAgenda').length;
    const agenda = subjects.length - beforeAgenda - outOfAgenda;
    console.log(`[og:${reqId}] fetched variant=${variant} total=${subjects.length} agenda=${agenda} beforeAgenda=${beforeAgenda} outOfAgenda=${outOfAgenda} in ${fetchMs}ms`);
}

// Meeting OG Image (Landscape - 1200x630)
const MeetingOGImage = async (cityId: string, meetingId: string, reqId: string) => {
    const fetchT0 = Date.now();
    console.log(`[og:${reqId}] fetching variant=default city=${cityId} meeting=${meetingId}`);
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) {
        console.log(`[og:${reqId}] not-found variant=default city=${cityId} meeting=${meetingId}`);
        return null;
    }
    logSubjectCounts(reqId, 'default', data.subjects ?? [], Date.now() - fetchT0);

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const sortT0 = Date.now();
    const sortedSubjects = sortSubjectsByImportance(data.subjects);
    console.log(`[og:${reqId}] sorted variant=default in ${Date.now() - sortT0}ms`);

    const cityDisplayName = formatCityDisplayName(data.city.name_municipality, data.administrativeBody?.name);

    return (
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI} watermarkProps={{ logoOnly: true, size: 80 }}>
            <OgHeader
                city={{
                    name: cityDisplayName,
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

                <MeetingMetaRow
                    formattedDate={formattedDate}
                    subjectsCount={data.subjects?.length || 0}
                    fontSize={28}
                    gap={24}
                    iconGap={8}
                />

                {sortedSubjects.length > 0 && (
                    <SubjectPills
                        subjects={sortedSubjects}
                        limit={3}
                        styles={{
                            containerGap: 10,
                            containerMarginTop: 16,
                            pillPadding: [10, 20],
                            pillRadius: 9999,
                            pillFontSize: 22,
                            pillFontWeight: 600,
                            pillBoxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            pillMaxWidth: '85%',
                            remainingFontSize: 18,
                            remainingMarginTop: 4,
                            remainingColor: '#6b7280',
                        }}
                    />
                )}
            </div>
        </Container>
    );
};

// Meeting Feed OG Image (Square - 1080x1080)
const MeetingFeedOGImage = async (cityId: string, meetingId: string, reqId: string) => {
    const fetchT0 = Date.now();
    console.log(`[og:${reqId}] fetching variant=feed city=${cityId} meeting=${meetingId}`);
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) {
        console.log(`[og:${reqId}] not-found variant=feed city=${cityId} meeting=${meetingId}`);
        return null;
    }
    logSubjectCounts(reqId, 'feed', data.subjects ?? [], Date.now() - fetchT0);

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const sortT0 = Date.now();
    const sortedSubjects = sortSubjectsByImportance(data.subjects);
    console.log(`[og:${reqId}] sorted variant=feed in ${Date.now() - sortT0}ms`);

    const cityDisplayName = formatCityDisplayName(data.city.name_municipality, data.administrativeBody?.name);

    return (
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI} watermarkProps={{ logoOnly: true, size: 120 }}>
            <OgHeader
                city={{
                    name: cityDisplayName,
                    logoImage: data.city.logoImage
                }}
            />

            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '28px',
                paddingTop: '8px',
            }}>
                <h1 style={{
                    fontSize: 64,
                    fontWeight: 800,
                    color: '#111827',
                    lineHeight: 1.25,
                    margin: 0,
                    maxWidth: '98%',
                }}>
                    {data.name}
                </h1>

                <MeetingMetaRow
                    formattedDate={formattedDate}
                    subjectsCount={data.subjects?.length || 0}
                    fontSize={32}
                    gap={24}
                    iconGap={8}
                />

                {sortedSubjects.length > 0 && (
                    <SubjectPills
                        subjects={sortedSubjects}
                        limit={6}
                        styles={{
                            containerGap: 14,
                            containerMarginTop: 14,
                            pillPadding: [16, 30],
                            pillRadius: 9999,
                            pillFontSize: 30,
                            pillFontWeight: 800,
                            pillBoxShadow: '0 3px 6px rgba(0, 0, 0, 0.08)',
                            pillMaxWidth: '95%',
                            remainingFontSize: 20,
                            remainingMarginTop: 4,
                            remainingColor: '#6b7280',
                        }}
                    />
                )}
            </div>
        </Container>
    );
};

// Meeting Story OG Image (1080×1920) is now rendered client-side via
// src/lib/export/storyImage.tsx + ShareDropdown to avoid the satori/yoga
// hang on Athens-scale data. The four templates are only invoked from the
// browser — `?variant=story` is no longer handled by this route.

// City OG Image
const CityOGImage = async (cityId: string) => {
    // Fetch only the data we need in parallel
    const [city, counts] = await Promise.all([
        getCity(cityId),
        prisma.$transaction([
            prisma.person.count({ where: { cityId } }),
            prisma.party.count({ where: { cityId } })
        ])
    ]);

    if (!city) return null;

    const [peopleCount, partiesCount] = counts;
    const meetingsCount = city._count.councilMeetings;

    return (
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI}>
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
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI} watermarkProps={{ logoOnly: true, size: 80 }}>
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
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI}>
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
                        getInitials(person.name)
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
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI}>
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
                                    getInitials(person.name)
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
        <div style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0a0a0a',
            padding: '60px 72px',
        }}>
            {/* Logo / wordmark top-left */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '56px' }}>
                <div style={{
                    fontSize: '22px',
                    fontWeight: '600',
                    color: '#ffffff',
                }}>
                    OpenCouncil
                </div>
            </div>

            {/* Main content */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '32px' }}>
                {/* Headline — two lines to avoid flexWrap */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{
                        fontSize: '56px',
                        fontWeight: '300',
                        color: '#ffffff',
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                    }}>
                        Το λειτουργικό σύστημα
                    </div>
                    <div style={{
                        fontSize: '56px',
                        fontWeight: '500',
                        color: '#f97316',
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                    }}>
                        των συλλογικών οργάνων
                    </div>
                </div>

                {/* Stat pills */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {['10 δήμοι', '5.000+ θέματα', '400+ ώρες συνεδριάσεων'].map((label) => (
                        <div key={label} style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '100px',
                            padding: '8px 20px',
                            fontSize: '20px',
                            color: 'rgba(255,255,255,0.75)',
                        }}>
                            {label}
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature tags bottom */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '40px' }}>
                {['Απομαγνητοφωνήσεις', 'Πρακτικά', 'Ειδοποιήσεις δημοτών', 'Χάρτης θεμάτων'].map((tag) => (
                    <div key={tag} style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(249,115,22,0.12)',
                        border: '1px solid rgba(249,115,22,0.3)',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '16px',
                        color: '#f97316',
                        fontWeight: '500',
                    }}>
                        {tag}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Explain Page OG Image (/explain — "Η τοπική αυτοδιοίκηση, απλά")
const ExplainOGImage = () => {
    return (
        <div style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0a0a0a',
            padding: '60px 72px',
        }}>
            {/* Logo / wordmark top-left */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '56px' }}>
                <div style={{
                    fontSize: '22px',
                    fontWeight: '600',
                    color: '#ffffff',
                }}>
                    OpenCouncil
                </div>
            </div>

            {/* Main content */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '32px' }}>
                {/* Headline — two lines to avoid flexWrap */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{
                        fontSize: '56px',
                        fontWeight: '300',
                        color: '#ffffff',
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                    }}>
                        Η τοπική αυτοδιοίκηση,
                    </div>
                    <div style={{
                        fontSize: '56px',
                        fontWeight: '500',
                        color: '#f97316',
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                    }}>
                        απλά
                    </div>
                </div>

                <div style={{
                    fontSize: '24px',
                    color: 'rgba(255,255,255,0.75)',
                    lineHeight: 1.4,
                    maxWidth: '900px',
                }}>
                    Πώς λειτουργούν οι δήμοι στην Ελλάδα — και πώς το OpenCouncil τους κάνει κατανοητούς
                </div>
            </div>

            {/* Section tags bottom */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '40px' }}>
                {['Έσοδα των δήμων', 'Όργανα & συνεδριάσεις', 'Αποφάσεις', 'Πώς δουλεύει το OpenCouncil'].map((tag) => (
                    <div key={tag} style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(249,115,22,0.12)',
                        border: '1px solid rgba(249,115,22,0.3)',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '16px',
                        color: '#f97316',
                        fontWeight: '500',
                    }}>
                        {tag}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Search Page OG Image
const SearchOGImage = () => {
    return (
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI}>
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
        <Container watermarkLogoSrc={LOGO_BLACK_DATA_URI}>
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');
    const consultationId = searchParams.get('consultationId');
    const personId = searchParams.get('personId');
    const subjectId = searchParams.get('subjectId');
    const pageType = searchParams.get('pageType'); // 'people', 'about', 'explain', 'search', 'chat'
    const variant = searchParams.get('variant'); // 'feed' for 1:1, default is landscape (story is client-side now)

    // Short per-request id so concurrent requests' logs can be untangled by grepping a tag.
    const reqId = crypto.randomUUID().slice(0, 8);
    console.log(`[og:${reqId}] enter variant=${variant ?? 'default'} city=${cityId ?? '-'} meeting=${meetingId ?? '-'} subject=${subjectId ?? '-'} pageType=${pageType ?? '-'}`);

    const slot = tryAcquireOgSlot();
    if (!slot) {
        const stats = getOgConcurrencyStats();
        console.warn(`[og:${reqId}] 429 capacity ${stats.active}/${stats.max} variant=${variant ?? 'default'}`);
        return new Response('OG image generator at capacity — try again shortly.', {
            status: 429,
            headers: { 'Retry-After': '5' },
        });
    }

    const t0 = Date.now();
    try {
        let element;
        let width = 1200;
        let height = 630;

        if (consultationId && cityId) {
            element = await ConsultationOGImage(cityId, consultationId);
        } else if (subjectId && meetingId && cityId) {
            // Subject-specific OG image - reuse the native opengraph-image.tsx logic
            // Note: locale doesn't affect the image content, so we use 'el' as default
            return await SubjectOgImage({ params: Promise.resolve({ locale: 'el', cityId, meetingId, subjectId }) });
        } else if (meetingId && cityId) {
            // Handle variant for meeting images. ?variant=story is no longer served here —
            // story exports render client-side via src/lib/export/storyImage.tsx. A stray
            // story request falls through to the default landscape, which is a reasonable
            // fallback for any external caller still on the old URL shape.
            if (variant === 'feed') {
                // Square format for feed posts
                element = await MeetingFeedOGImage(cityId, meetingId, reqId);
                width = 1080;
                height = 1080;
            } else {
                // Default landscape format
                element = await MeetingOGImage(cityId, meetingId, reqId);
            }
        } else if (personId && cityId) {
            element = await PersonOGImage(cityId, personId);
        } else if (pageType === 'people' && cityId) {
            element = await PeopleOGImage(cityId);
        } else if (pageType === 'about') {
            element = AboutOGImage();
        } else if (pageType === 'explain') {
            element = ExplainOGImage();
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
            console.log(`[og:${reqId}] not-found before-image-construction t=${Date.now() - t0}ms`);
            return new Response('Not found', { status: 404 });
        }

        // ImageResponse construction is cheap but the satori render is lazy — it runs
        // when the body is consumed. Force it to complete here (inside the slot) by
        // awaiting arrayBuffer(), so the concurrency cap actually caps satori work
        // instead of just capping handler invocations.
        console.log(`[og:${reqId}] image-construct variant=${variant ?? 'default'} dim=${width}x${height} t=${Date.now() - t0}ms`);
        const satoriT0 = Date.now();
        const imageResponse = new ImageResponse(element, { width, height });
        // Heartbeat while waiting for satori. If these logs FIRE during a hang, the
        // event loop is alive and satori is in an async wait (probably a fetch). If they
        // do NOT fire, satori is sync-blocked in WASM and no JS code can run on this
        // thread until it returns. That's the binary diagnostic we need.
        const heartbeat = setInterval(() => {
            console.log(`[og:${reqId}] still rendering at ${Date.now() - satoriT0}ms`);
        }, 2000);
        let buffer: ArrayBuffer;
        try {
            buffer = await imageResponse.arrayBuffer();
        } finally {
            clearInterval(heartbeat);
        }
        console.log(`[og:${reqId}] rendered variant=${variant ?? 'default'} bytes=${buffer.byteLength} satori=${Date.now() - satoriT0}ms`);
        // Restore the Cache-Control that next/og's ImageResponse sets by default —
        // dropping it would make every crawler unfurl re-render, defeating the cap.
        // Matches next/og's exact defaults including the dev no-cache branch.
        return new Response(buffer, {
            status: 200,
            headers: {
                'content-type': 'image/png',
                'cache-control': process.env.NODE_ENV === 'development'
                    ? 'no-cache, no-store'
                    : 'public, immutable, no-transform, max-age=31536000',
            },
        });
    } catch (e) {
        console.error(`[og:${reqId}] error:`, e);
        return new Response('Failed to generate image', { status: 500 });
    } finally {
        slot.release();
        const stats = getOgConcurrencyStats();
        // Now includes the satori render itself (we awaited arrayBuffer() above).
        console.log(`[og:${reqId}] exit variant=${variant ?? 'default'} t=${Date.now() - t0}ms slots=${stats.active}/${stats.max}`);
    }
}