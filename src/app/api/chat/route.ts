import { NextRequest } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import prisma from '@/lib/db/prisma';
import { getSubject } from '@/lib/db/subject';
import { getCity } from '@/lib/db/cities';
import { getCouncilMeeting } from '@/lib/db/meetings';
import { getPeopleForCity } from '@/lib/db/people';
import { getStatisticsFor } from '@/lib/statistics';

// Create an Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export const runtime = 'edge';

// Helper to convert dates to ISO strings
function serializeData(data: any): any {
    if (data === null || data === undefined) {
        return data;
    }

    if (data instanceof Date) {
        return data.toISOString();
    }

    if (Array.isArray(data)) {
        return data.map(item => serializeData(item));
    }

    if (typeof data === 'object') {
        const result: any = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                result[key] = serializeData(data[key]);
            }
        }
        return result;
    }

    return data;
}

// Function to fetch real subjects from the database
async function getRealSubjects(count = 3) {
    try {
        console.log(`Fetching ${count} real subjects...`);

        // Get random subjects
        const subjects = await prisma.subject.findMany({
            take: count,
            where: {
                description: {
                    not: '',
                },
            },
            orderBy: [
                // Use a more consistent ordering to get diverse results
                { hot: 'desc' },
                { createdAt: 'desc' }
            ],
            include: {
                topic: true,
                location: true,
                introducedBy: {
                    include: {
                        party: true,
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true,
                            },
                        },
                    },
                },
                highlights: true,
            },
        });

        console.log(`Found ${subjects.length} subjects from database`);

        if (subjects.length === 0) {
            // If no subjects found, create mock subjects for testing
            console.log("No subjects found, creating mock subjects");
            return createMockSubjects(count);
        }

        // For each subject, fetch additional required data
        const enrichedSubjects = await Promise.all(subjects.map(async (subject) => {
            try {
                const [city, meeting, people] = await Promise.all([
                    getCity(subject.cityId),
                    getCouncilMeeting(subject.cityId, subject.councilMeetingId),
                    getPeopleForCity(subject.cityId),
                ]);

                if (!city || !meeting) {
                    console.error(`Missing city or meeting for subject ${subject.id}`);
                    return null;
                }

                const statistics = await getStatisticsFor({ subjectId: subject.id }, ['person', 'party']);

                // Add necessary properties for the SubjectCard component
                return {
                    ...subject,
                    statistics,
                    city,
                    meeting,
                    persons: people,
                    parties: people
                        .flatMap(p => p.roles
                            .filter(r => r.party)
                            .map(r => r.party))
                        .filter((v, i, a) =>
                            v !== null && a.findIndex(t => t && t.id === v!.id) === i),
                };
            } catch (error) {
                console.error(`Error enriching subject ${subject.id}:`, error);
                return null;
            }
        }));

        // Filter out any null values from failed enrichment
        const validSubjects = enrichedSubjects.filter(subject => subject !== null);
        console.log(`Returning ${validSubjects.length} enriched subjects`);

        // Serialize the subjects to handle Date objects and other complex types
        return serializeData(validSubjects);
    } catch (error) {
        console.error('Error fetching real subjects:', error);
        console.log("Creating mock subjects due to error");
        return createMockSubjects(count);
    }
}

// Add proper types
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    id?: string;
    done?: boolean;
    error?: boolean;
    subjectReferences?: any[];
}

interface StreamData {
    id: string;
    role: 'assistant';
    content: string;
    done: boolean;
    subjectReferences?: any[];
    error?: boolean;
}

// Constants
const SYSTEM_PROMPT = `Είστε ένας βοηθός AI για το OpenCouncil, μια πλατφόρμα που παρέχει πρόσβαση σε 
μεταγραφές συνεδριάσεων δημοτικών συμβουλίων και δεδομένα. Απαντήστε σε ερωτήσεις σχετικά με τη δημοτική διακυβέρνηση, 
τις διαδικασίες του δημοτικού συμβουλίου και θέματα αστικού σχεδιασμού. Παρέχετε χρήσιμες, συνοπτικές απαντήσεις. 
Αν δεν γνωρίζετε την απάντηση, πείτε το ξεκάθαρα αντί να επινοείτε πληροφορίες.`;

const ERROR_MESSAGE = "Συγγνώμη, παρουσιάστηκε σφάλμα κατά την επεξεργασία του αιτήματός σας. Παρακαλώ δοκιμάστε ξανά.";

// Create mock subjects for testing when real subjects can't be fetched
function createMockSubjects(count = 3) {
    const subjects = [];
    const topics = ["Urban Development", "Environment", "Public Safety"];
    const descriptions = [
        "Discussion about city center renovation and infrastructure improvements.",
        "Environmental initiatives and waste management proposals.",
        "Public safety measures and crime prevention strategies."
    ];

    for (let i = 0; i < count; i++) {
        const mockCity = {
            id: `city${i}`,
            name: "Athens",
            name_en: "Athens",
            name_municipality: "Municipality of Athens",
            name_municipality_en: "Municipality of Athens",
            logoImage: null,
            timezone: "Europe/Athens",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            officialSupport: true,
            isListed: true,
            isPending: false,
            authorityType: "municipality",
            wikipediaId: null
        };

        const mockMeeting = {
            id: `meeting${i}`,
            name: "City Council Meeting",
            name_en: "City Council Meeting",
            dateTime: new Date().toISOString(),
            youtubeUrl: null,
            agendaUrl: null,
            videoUrl: null,
            audioUrl: null,
            muxPlaybackId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            released: true,
            cityId: mockCity.id,
            administrativeBodyId: null
        };

        const mockPersons = [
            {
                id: `person${i}1`,
                name: "John Smith",
                name_en: "John Smith",
                name_short: "J. Smith",
                name_short_en: "J. Smith",
                image: null,
                role: "Mayor",
                role_en: "Mayor",
                isAdministrativeRole: true,
                activeFrom: new Date().toISOString(),
                activeTo: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                profileUrl: null,
                cityId: mockCity.id,
                partyId: `party${i}1`,
                roles: []
            }
        ];

        const mockParties = [
            {
                id: `party${i}1`,
                name: "Democratic Party",
                name_en: "Democratic Party",
                name_short: "DP",
                name_short_en: "DP",
                colorHex: "#3B82F6",
                logo: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                cityId: mockCity.id
            }
        ];

        subjects.push({
            id: `subject${i}`,
            name: topics[i % topics.length],
            description: descriptions[i % descriptions.length],
            hot: i === 0,
            agendaItemIndex: i + 1,
            nonAgendaReason: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cityId: mockCity.id,
            councilMeetingId: mockMeeting.id,
            personId: mockPersons[0].id,
            topicId: null,
            locationId: null,
            context: null,
            contextCitationUrls: [],
            location: { text: "City Center" },
            topic: null,
            introducedBy: mockPersons[0],
            speakerSegments: [],
            highlights: [],
            statistics: null,
            city: mockCity,
            meeting: mockMeeting,
            persons: mockPersons,
            parties: mockParties
        });
    }

    console.log(`Created ${subjects.length} mock subjects`);
    return subjects;
}

export async function POST(req: NextRequest) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Create a transform stream for the AI response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the streaming response immediately
    const streamResponse = new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });

    // Process the request asynchronously
    (async () => {
        try {
            const { messages } = await req.json();

            // Validate messages
            if (!Array.isArray(messages)) {
                throw new Error('Invalid messages format');
            }

            // Convert chat history to Claude's format
            const claudeMessages = messages.map((message: ChatMessage) => ({
                role: message.role,
                content: message.content,
            }));

            // Fetch real subjects from the database while streaming the response
            const subjectPromise = getRealSubjects(3);

            // Get the streaming response from Claude
            const claudeResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 1000,
                system: SYSTEM_PROMPT,
                messages: claudeMessages,
                stream: true,
            });

            // Keep track of the accumulated content
            let accumulatedContent = '';
            let lastChunkTime = Date.now();
            const CHUNK_INTERVAL = 16; // ~60fps for smoother updates

            // Process each chunk from Claude
            for await (const chunk of claudeResponse) {
                if (chunk.type === 'content_block_delta') {
                    // The chunk delta may contain text content
                    const deltaText = chunk.delta && 'text' in chunk.delta ? chunk.delta.text || '' : '';

                    // Append the chunk text to the accumulated content
                    accumulatedContent += deltaText;

                    // Only send chunks at a reasonable interval to prevent flickering
                    const now = Date.now();
                    if (now - lastChunkTime >= CHUNK_INTERVAL) {
                        // Send the delta to the client
                        const data = {
                            id: Date.now().toString(),
                            role: 'assistant',
                            content: accumulatedContent,
                            done: false
                        };
                        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                        lastChunkTime = now;
                    }
                }
            }

            // Send one final chunk with the complete content
            const finalData = {
                id: Date.now().toString(),
                role: 'assistant',
                content: accumulatedContent,
                done: false
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));

            // Wait for the subjects to be ready
            const subjectReferences = await subjectPromise;
            console.log(`Retrieved ${subjectReferences.length} subject references for response`);

            // Send the final message with subjects
            const completeData = {
                id: Date.now().toString(),
                role: 'assistant',
                content: accumulatedContent,
                subjectReferences,
                done: true
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`));

            // Close the stream
            await writer.close();
        } catch (error) {
            console.error('Error in chat API route:', error);

            // Send an error message to the client
            const mockSubjects = createMockSubjects(3);
            const errorData = {
                id: Date.now().toString(),
                role: 'assistant',
                content: ERROR_MESSAGE,
                subjectReferences: mockSubjects,
                error: true,
                done: true
            };

            try {
                await writer.write(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
                await writer.close();
            } catch (e) {
                console.error('Error writing to stream:', e);
            }
        }
    })();

    return streamResponse;
} 