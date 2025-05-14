import { NextRequest } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { SegmentWithRelations } from "@/lib/db/speakerSegments";
import { search, SearchResultDetailed, SearchConfig } from '@/lib/search/search';
import { Party } from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { ChatMessage } from '@/types/chat';
import * as fs from 'fs';
import * as path from 'path';

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

// Create an Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Development Configuration
const DEV_CONFIG = {
    logPrompts: process.env.NODE_ENV === 'development',
    promptsDir: path.join(process.cwd(), 'logs', 'prompts'),
};

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

// Utility function to log prompts in development
function logPromptToFile(systemPrompt: string, messages: any[]) {
    if (!DEV_CONFIG.logPrompts) return;

    try {
        // Ensure the logs directory exists
        if (!fs.existsSync(DEV_CONFIG.promptsDir)) {
            fs.mkdirSync(DEV_CONFIG.promptsDir, { recursive: true });
        }

        // Create a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(DEV_CONFIG.promptsDir, `prompt-${timestamp}.json`);

        // Create the log object
        const logObject = {
            timestamp,
            systemPrompt,
            messages,
            metadata: {
                nodeEnv: process.env.NODE_ENV,
                maxTokens: CONTEXT_CONFIG.maxTokens,
                maxMessages: CONTEXT_CONFIG.maxMessages,
            }
        };

        // Write to file
        fs.writeFileSync(filename, JSON.stringify(logObject, null, 2));
        console.log(`[Dev] Prompt logged to ${filename}`);
    } catch (error) {
        console.error('[Dev] Error logging prompt:', error);
    }
}

// Content Extraction
function extractRelevantContent(searchResults: SearchResultDetailed[]): ExtractedSubject[] {
    console.log(`[Content Extraction] Processing ${searchResults.length} search results`);
    
    const extracted = searchResults.map(result => {
        // Get matched segments from the detailed results
        const matchedSegments = (result.speakerSegments as SegmentWithRelations[])
            .filter(segment => result.matchedSpeakerSegmentIds?.includes(segment.id));
            
        console.log(`[Content Extraction] Subject "${result.name}":`);
        console.log(`  - Score: ${result.score}`);
        console.log(`  - Total Segments: ${result.speakerSegments.length}`);
        console.log(`  - Matched Segments: ${matchedSegments.length}`);
        console.log(`  - Has Context: ${result.context ? 'Yes' : 'No'}`);
        
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

    console.log(`[Content Extraction] Total segments extracted: ${extracted.reduce((acc, curr) => acc + curr.keySegments.length, 0)}`);
    return extracted;
}

// Utility function to clean context of references
function cleanContextReferences(context: string | undefined): string | undefined {
    if (!context) return undefined;
    // Remove references in the format [X] where X is any number
    return context.replace(/\[\d+\]/g, '');
}

// Context Enhancement
function enhancePrompt(
    messages: ChatMessage[],
    context: ReturnType<typeof extractRelevantContent>
) {
    console.log(`[Prompt Enhancement] Enhancing prompt with:`);
    console.log(`  - Messages: ${messages.length}`);
    console.log(`  - Context subjects: ${context.length}`);
    console.log(`  - Use All Segments: ${CONTEXT_CONFIG.useAllSegments}`);
    
    const systemPrompt = `${SYSTEM_PROMPT}

Σχετικά θέματα συμβουλίου (με σειρά προτεραιότητας):
${context.map((subject, index) => {
    console.log(`[Prompt Enhancement] Processing subject ${index + 1}:`);
    console.log(`  - Total Segments: ${subject.speakerSegments.length}`);
    console.log(`  - Key Segments: ${subject.keySegments.length}`);
    console.log(`  - Has Context: ${subject.context ? 'Yes' : 'No'}`);
    
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
        const partyName = segment.person?.roles?.[0]?.party?.name || 'Ανεξάρτητος';
        return `${prefix}${segment.speaker} (${partyName}): "${segment.text}"`;
    }).join('\n')
    : subject.keySegments.map(segment => {
        const partyName = segment.person?.roles?.[0]?.party?.name || 'Ανεξάρτητος';
        return `• ${segment.speaker} (${partyName}): "${segment.text}"`;
    }).join('\n')
}
----------------------------------------`}).join('\n\n')}

${CONTEXT_CONFIG.useAllSegments ? 'Σημείωση: Τα αποσπάσματα με 🔹 είναι τα πιο σχετικά με την ερώτησή σας.' : ''}`;

    // Log approximate token count
    const approximateTokens = systemPrompt.split(/\s+/).length;
    console.log(`[Prompt Enhancement] Approximate token count: ${approximateTokens}`);

    // Strip out id field from messages before sending to Claude
    const cleanedMessages = messages.slice(-CONTEXT_CONFIG.maxMessages).map(({ role, content }) => ({
        role,
        content
    }));

    console.log(`[Prompt Enhancement] Sending ${cleanedMessages.length} cleaned messages to Claude`);

    // Log the prompt in development mode
    logPromptToFile(systemPrompt, cleanedMessages);

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
            console.log(`[Chat API] New request received`);
            const { messages, cityId } = await req.json();
            
            // Log request details
            console.log(`[Chat API] Request details:`);
            console.log(`  - Messages: ${messages.length}`);
            console.log(`  - City ID: ${cityId || 'none'}`);
            console.log(`  - Last message: "${messages[messages.length - 1].content.substring(0, 50)}..."`);

            // 1. Perform search with detailed results
            console.log(`[Search] Initiating search with query: "${messages[messages.length - 1].content}"`);
            const searchResults = await search({
                query: messages[messages.length - 1].content,
                cityIds: cityId ? [cityId] : undefined,
                config: {
                    ...searchConfig,
                    detailed: true // Ensure we get detailed results
                }
            });

            // Ensure we have detailed results
            if (!searchResults.results.every(result => 'speakerSegments' in result)) {
                throw new Error('Search results do not contain detailed speaker segments');
            }

            const detailedResults = searchResults.results as SearchResultDetailed[];
            console.log(`[Search] Found ${detailedResults.length} results`);

            // 2. Extract content
            const context = extractRelevantContent(detailedResults);

            // 3. Enhance prompt
            const enhancedPrompt = enhancePrompt(messages, context);

            // 4. Get LLM response
            console.log(`[LLM] Sending request to Claude`);
            const claudeResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 1000,
                system: enhancedPrompt.system,
                messages: enhancedPrompt.messages,
                stream: true,
            });

            // 5. Track subjects
            const subjectReferences = detailedResults.map(result => {
                // Get unique parties from the city
                const parties = (result.councilMeeting.city as any).parties || [] as Party[];
                
                // Get all persons from the city
                const persons = (result.councilMeeting.city as any).persons || [] as PersonWithRelations[];
                
                return {
                    id: result.id,
                    name: result.name,
                    description: result.description,
                    councilMeeting: {
                        id: result.councilMeeting.id,
                        name: result.councilMeeting.name,
                        name_en: result.councilMeeting.name_en,
                        dateTime: result.councilMeeting.dateTime,
                        city: {
                            id: result.councilMeeting.city.id,
                            name: result.councilMeeting.city.name,
                            name_en: result.councilMeeting.city.name_en,
                            name_municipality: result.councilMeeting.city.name_municipality,
                            name_municipality_en: result.councilMeeting.city.name_municipality_en,
                            logoImage: result.councilMeeting.city.logoImage,
                            timezone: result.councilMeeting.city.timezone,
                            officialSupport: result.councilMeeting.city.officialSupport,
                            isListed: result.councilMeeting.city.isListed,
                            isPending: result.councilMeeting.city.isPending,
                            authorityType: result.councilMeeting.city.authorityType,
                            parties: parties.map((party: Party) => ({
                                id: party.id,
                                name: party.name,
                                name_en: party.name_en,
                                name_short: party.name_short,
                                name_short_en: party.name_short_en,
                                colorHex: party.colorHex,
                                logo: party.logo
                            }))
                        }
                    },
                    topic: result.topic,
                    introducedBy: result.introducedBy,
                    location: result.location,
                    speakerSegments: result.speakerSegments,
                    city: {
                        ...result.councilMeeting.city,
                        parties: parties.map((party: Party) => ({
                            id: party.id,
                            name: party.name,
                            name_en: party.name_en,
                            name_short: party.name_short,
                            name_short_en: party.name_short_en,
                            colorHex: party.colorHex,
                            logo: party.logo
                        }))
                    },
                    meeting: result.councilMeeting,
                    parties: parties.map((party: Party) => ({
                        id: party.id,
                        name: party.name,
                        name_en: party.name_en,
                        name_short: party.name_short,
                        name_short_en: party.name_short_en,
                        colorHex: party.colorHex,
                        logo: party.logo
                    })),
                    persons: persons.map((person: PersonWithRelations) => ({
                        id: person.id,
                        name: person.name,
                        name_en: person.name_en,
                        name_short: person.name_short,
                        name_short_en: person.name_short_en,
                        image: person.image,
                        partyId: person.partyId,
                        roles: person.roles
                    }))
                };
            });

            console.log(`[Chat API] Response prepared with:`);
            console.log(`  - Subject references: ${subjectReferences.length}`);
            console.log(`  - Streaming response: true`);

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
        }
    })();

    return streamResponse;
} 