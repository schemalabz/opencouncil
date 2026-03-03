import { NextRequest } from 'next/server';
import { SegmentWithRelations } from "@/lib/db/speakerSegments";
import { search, SearchResultDetailed, SearchConfig } from '@/lib/search';
import { PersonWithRelations, getPeopleForCity } from '@/lib/db/people';
import { ChatMessage } from '@/types/chat';
import { aiChatStream, AIConfig, DEFAULT_AI_MODEL } from '@/lib/ai';
import { City } from '@prisma/client';
import {
    findSubjectsByQuery,
    findMockSpeakerSegmentsForSubject,
    generateMockClaudeResponse
} from '@/lib/db/chat-mock-data';
import { getCity } from '@/lib/db/cities';
import { IS_DEV } from '@/lib/utils';
import { groupPeopleByActiveParty } from '@/lib/sorting/people';

// Define types for our content extraction
interface ExtractedSegment {
    speaker: string;
    text: string;
    person: PersonWithRelations | null;
}

interface ExtractedSubject {
    name: string;
    description: string;
    topic?: string;
    context?: string;
    keySegments: ExtractedSegment[];
    speakerSegments: ExtractedSegment[];
}

// Search Configuration
const searchConfig: SearchConfig = {
    size: 5,
    enableSemanticSearch: true,
    rankWindowSize: 100,
    rankConstant: 60,
    detailed: true // We need detailed results for chat
};

// Context Management
const CONTEXT_CONFIG = {
    maxMessages: 10,
    maxTokens: 10000,
    useAllSegments: true,
};

// AI Configuration
const AI_CONFIG: AIConfig = {
    maxTokens: 1000,
    model: DEFAULT_AI_MODEL,
    temperature: 0,
};

// @TODO: Better logging in the future
// Helper function for essential logs that should always be shown
const logEssential = (message: string, data?: any) => {
    console.log(`[Chat Analytics] ${message}`, data || '');
};

// Helper function for development-only logs
const logDev = (message: string, data?: any) => {
    if (IS_DEV) {
        console.log(`[Dev] ${message}`, data || '');
    }
};

// Content Extraction
function extractRelevantContent(searchResults: SearchResultDetailed[]): ExtractedSubject[] {
    logDev(`[Content Extraction] Processing ${searchResults.length} search results`);

    const extracted = searchResults.map(result => {
        // Get matched segments from the detailed results
        const matchedSegments = (result.speakerSegments as SegmentWithRelations[])
            .filter(segment => result.matchedSpeakerSegmentIds?.includes(segment.id));

        logDev(`[Content Extraction] Subject "${result.name}":`, {
            score: result.score,
            totalSegments: result.speakerSegments.length,
            matchedSegments: matchedSegments.length,
            hasContext: result.context ? 'Yes' : 'No'
        });

        return {
            name: result.name,
            description: result.description,
            topic: result.topic?.name,
            context: result.context,
            keySegments: matchedSegments.map(segment => ({
                speaker: segment.person?.name || 'Unknown',
                text: segment.text,
                person: segment.person
            })),
            speakerSegments: (result.speakerSegments as SegmentWithRelations[]).map(segment => ({
                speaker: segment.person?.name || 'Unknown',
                text: segment.text,
                person: segment.person
            }))
        };
    });

    logDev(`[Content Extraction] Total segments extracted: ${extracted.reduce((acc, curr) => acc + curr.keySegments.length, 0)}`);
    return extracted;
}

// Utility function to clean context of references
function cleanContextReferences(context: string | undefined): string | undefined {
    if (!context) return undefined;
    // Remove references in the format [X] where X is any number
    return context.replace(/\[\d+\]/g, '');
}

/**
 * Formats the city political context into a human-readable string.
 * Groups people by party and formats their roles with proper separators.
 */
function formatCityPoliticalContext(city: City, people: PersonWithRelations[]) {
    type FormattedPerson = { name: string; roles: string };
    type PeopleByParty = Record<string, FormattedPerson[]>;

    // Group people by party name for display
    const groupedPeople = groupPeopleByActiveParty(people, 'name');

    // Format people with their roles
    const peopleByParty: PeopleByParty = Object.entries(groupedPeople).reduce((acc, [partyName, partyPeople]) => {
        acc[partyName] = partyPeople.map(person => {
            // Format roles for this person, filtering out unnecessary roles
            const formattedRoles = person.roles
                .filter(role => role.city || role.administrativeBody) // Only include city and admin body roles
                .map(role => {
                    if (role.city) return `${role.name || "Μέλος"}`;
                    if (role.administrativeBody) return `${role.administrativeBody.name} (${role.name || "Μέλος"})`;
                    return null;
                })
                .filter(Boolean)
                .join(", ");

            return {
                name: person.name,
                roles: formattedRoles
            };
        });

        // Sort people within each party by name
        acc[partyName].sort((a, b) => a.name.localeCompare(b.name));

        return acc;
    }, {} as PeopleByParty);

    return `
Πληροφορίες για το ${city.name} (${city.name_municipality}):

Κόμματα και Μέλη:
${Object.entries(peopleByParty)
            .map(([party, members]) =>
                `${party}:\n${(members as FormattedPerson[]).map(member => `  - ${member.name} [${member.roles}]`).join('\n')}`)
            .join('\n\n')}

----------------------------------------
`;
}

/**
 * Enhances the chat prompt with city context and relevant content.
 * 
 * Example prompt format:
 * ```
 * [System Prompt]
 * 
 * Πληροφορίες για το Χανιά (Δήμος Χανίων):
 * 
 * Κόμματα και Μέλη:
 * Για τα Χανιά:
 *   - Αδάμ Μπούτζουκας [Δημοτικό Συμβούλιο (Μέλος)]
 *   - Αναστάσιος Αλόγλου [Αντιδήμαρχος Οικονομικών & Ψηφιακής Διακυβέρνησης, Δημοτικό Συμβούλιο (Μέλος), Δημοτική Επιτροπή (Πρόεδρος)]
 * 
 * Λαϊκή Συσπείρωση Χανίων:
 *   - Μιλτιάδης Κλωνιζάκης [Δημοτικό Συμβούλιο (Γραμματέας), Δημοτική Επιτροπή (Αναπληρωματικό Μέλος)]
 * 
 * Ανεξάρτητοι:
 *   - Μιχαήλ Σχοινάς [Δημοτικό Συμβούλιο (Αντιπρόεδρος)]
 * 
 * ----------------------------------------
 * 
 * Σχετικά θέματα συμβουλίου (με σειρά προτεραιότητας):
 * [1] Θέμα: Αναβάθμιση πάρκων
 * Κατηγορία: Περιβάλλον
 * Περιγραφή: Προτάσεις για αναβάθμιση των δημοτικών πάρκων
 * 
 * Αποσπάσματα ομιλιών:
 * 🔹 Γιώργος Παπαδάκης (Νέα Δημοκρατία): "Πρότεινα την αναβάθμιση του κεντρικού πάρκου..."
 * • Μαρία Κουτσογιάννη (Νέα Δημοκρατία): "Συμφωνώ με την πρόταση..."
 * 
 * ----------------------------------------
 * ```
 */
async function enhancePrompt(messages: ChatMessage[], context: ReturnType<typeof extractRelevantContent>, cityId?: string) {
    logDev(`[Prompt Enhancement] Enhancing prompt with:`, {
        messages: messages.length,
        contextSubjects: context.length,
        useAllSegments: CONTEXT_CONFIG.useAllSegments,
        cityId
    });

    let cityContext = '';
    if (cityId) {
        const city = await getCity(cityId)
        if (city) {
            const people = await getPeopleForCity(cityId, true); // Only get active roles
            cityContext = formatCityPoliticalContext(city, people);
        }
    }

    const systemPrompt = `${SYSTEM_PROMPT}

${cityContext}

Σχετικά θέματα συμβουλίου (με σειρά προτεραιότητας):
${context.map((subject, index) => {
        logDev(`[Prompt Enhancement] Processing subject ${index + 1}:`, {
            totalSegments: subject.speakerSegments.length,
            keySegments: subject.keySegments.length,
            hasContext: subject.context ? 'Yes' : 'No'
        });

        return `
----------------------------------------
[${index + 1}] Θέμα: ${subject.name}
${subject.topic ? `Κατηγορία: ${subject.topic}` : ''}
Περιγραφή: ${subject.description}
${subject.context ? `\nΠρόσθετο περιεχόμενο για το θέμα: ${cleanContextReferences(subject.context)}` : ''}

Αποσπάσματα ομιλιών:
${CONTEXT_CONFIG.useAllSegments
                ? subject.speakerSegments.map(segment => {
                    const isKeySegment = subject.keySegments.some(keySeg => keySeg.text === segment.text);
                    const prefix = isKeySegment && CONTEXT_CONFIG.useAllSegments ? '🔹 ' : '• ';
                    return `${prefix}${segment.speaker}: "${segment.text}"`;
                }).join('\n')
                : subject.keySegments.map(segment => {
                    return `• ${segment.speaker}: "${segment.text}"`;
                }).join('\n')
            }
----------------------------------------`}).join('\n\n')}

${CONTEXT_CONFIG.useAllSegments ? 'Σημείωση: Τα αποσπάσματα με 🔹 είναι τα πιο σχετικά με την ερώτησή σας.' : ''}`;

    // Log approximate token count
    const approximateTokens = systemPrompt.split(/\s+/).length;
    logDev(`[Prompt Enhancement] Approximate token count: ${approximateTokens}`);

    // Strip out id field from messages before sending to Claude
    const cleanedMessages = messages.slice(-CONTEXT_CONFIG.maxMessages).map(({ role, content }) => ({
        role,
        content
    }));

    logDev(`[Prompt Enhancement] Sending ${cleanedMessages.length} cleaned messages to Claude`);

    return {
        system: systemPrompt,
        messages: cleanedMessages
    };
}

// Constants
const SYSTEM_PROMPT = `Είστε ένας εξειδικευμένος βοηθός AI για το OpenCouncil, μια πλατφόρμα που παρέχει πρόσβαση σε μεταγραφές και δεδομένα από συνεδριάσεις δημοτικών συμβουλίων. 

Ρόλος και Δεδομένα:
- Είστε ειδικός στη δημοτική διακυβέρνηση και τις διαδικασίες των δημοτικών συμβουλίων
- Έχετε πρόσβαση σε μεταγραφές συνεδριάσεων, θέματα συμβουλίου, και σχετικά δεδομένα
- Μπορείτε να αναφέρεστε σε συγκεκριμένα θέματα συμβουλίου και αποσπάσματα ομιλιών

Τύποι Ερωτήσεων:
- Ερωτήσεις για διαδικασίες δημοτικών συμβουλίων
- Ερωτήσεις για συγκεκριμένα θέματα συμβουλίου
- Ερωτήσεις για αστικό σχεδιασμό και πολιτικές
- Ερωτήσεις για συμβούλους και κόμματα
- Ερωτήσεις για τοπικά θέματα και προβλήματα

Γενικές Οδηγίες:
- Παρέχετε ακριβείς και ενημερωτικές απαντήσεις
- Απαντήστε άμεσα και συνοπτικά χωρίς περιττές εισαγωγές
- Χρησιμοποιήστε τα δεδομένα του context για να υποστηρίξετε τις απαντήσεις σας
- Όταν αναφέρεστε σε θέματα, χρησιμοποιήστε την αναφορά [X] όπου X είναι ο αριθμός του θέματος
- Αν δεν γνωρίζετε την απάντηση, πείτε το ξεκάθαρα
- Μην επινοείτε πληροφορίες

Τόνος και Γλώσσα:
- Χρησιμοποιήστε επαγγελματικό αλλά προσιτό τόνο
- Χρησιμοποιήστε τεχνικούς όρους όπου είναι απαραίτητο, αλλά εξηγήστε τους όταν χρειάζεται
- Διατηρήστε αντικειμενικότητα και ισορροπία στις απαντήσεις

Μορφοποίηση:
- Χρησιμοποιήστε λίστες για σύντομες απαντήσεις
- Χωρίστε μεγάλες απαντήσεις σε παραγράφους
- Επισήμανε σημαντικά σημεία με έμφαση όπου χρειάζεται
- Όταν αναφέρεστε σε θέματα, χρησιμοποιήστε πάντα την αναφορά [X] για συνέπεια`;

const ERROR_MESSAGE = "Συγγνώμη, παρουσιάστηκε σφάλμα κατά την επεξεργασία του αιτήματός σας. Παρακαλώ δοκιμάστε ξανά.";

// Helper function to determine if we should use mock data
function shouldUseMockData(useMockData: boolean): boolean {
    return useMockData && IS_DEV;
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
            logEssential('Chat Session Started');
            const { messages, cityId, useMockData } = await req.json();

            // Log request details
            logEssential('Chat Request Details', {
                messages: messages.length,
                cityId: cityId || 'none',
                useMockData: shouldUseMockData(useMockData),
                lastMessage: messages[messages.length - 1].content.substring(0, 50)
            });

            let searchResults: SearchResultDetailed[] = [];

            if (shouldUseMockData(useMockData)) {
                // Use seed data for development/testing
                const subjects = findSubjectsByQuery(messages[messages.length - 1].content, cityId);
                searchResults = subjects.map(subject => {
                    // Get mock speaker segments for this subject
                    const mockSegments = findMockSpeakerSegmentsForSubject(subject.name);

                    return {
                        ...subject,
                        score: 1.0,
                        speakerSegments: mockSegments,
                        matchedSpeakerSegmentIds: mockSegments.map(s => s.id),
                        context: subject.context || null,
                        highlights: [],
                        location: null,
                        topic: null,
                        introducedBy: null
                    };
                }) as unknown as SearchResultDetailed[];
            } else {
                // Perform real search
                const searchResponse = await search({
                    query: messages[messages.length - 1].content,
                    cityIds: cityId ? [cityId] : undefined,
                    config: {
                        ...searchConfig,
                        detailed: true
                    }
                });

                if (!searchResponse.results.every(result => 'speakerSegments' in result)) {
                    throw new Error('Search results do not contain detailed speaker segments');
                }

                searchResults = searchResponse.results as SearchResultDetailed[];
            }

            logEssential('Search Results', {
                count: searchResults.length,
                useMockData: useMockData || false
            });

            // 2. Extract content
            const context = extractRelevantContent(searchResults);

            // 3. Enhance prompt
            const enhancedPrompt = await enhancePrompt(messages, context, cityId);

            // 4. Get LLM response
            logEssential('Sending request to Claude');
            const claudeResponse = shouldUseMockData(useMockData)
                ? generateMockClaudeResponse(messages, searchResults)
                : await aiChatStream(
                    enhancedPrompt.system,
                    enhancedPrompt.messages,
                    AI_CONFIG
                );

            // 5. Track subjects
            const subjectReferences = searchResults;

            logEssential('Chat Response Prepared', {
                subjectReferences: subjectReferences.length,
                streaming: true,
                useMockData: useMockData || false
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

            logEssential('Chat Session Completed');
        } catch (error) {
            console.error(`[Chat API] Error:`, error);

            // Send an error message to the client
            const errorData = {
                id: Date.now().toString(),
                role: 'assistant',
                content: ERROR_MESSAGE,
                subjectReferences: [],
                error: true,
                done: true
            };

            try {
                await writer.write(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
                await writer.close();
            } catch (e) {
                console.error('Error writing to stream:', e);
            }

            logEssential('Chat Session Failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    })();

    return streamResponse;
} 