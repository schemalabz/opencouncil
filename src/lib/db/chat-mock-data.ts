import { SeedData } from './types';
import { loadSeedData } from '../seed-data';
import { ChatMessage } from '@/types/chat';
import type { SearchResultDetailed } from '@/lib/search';
import { getRandomItems } from '../seed-data';
import { Subject, City } from '@prisma/client';
import { SubjectWithRelations } from '@/lib/db/subject';
import { MeetingWithAllData } from '@/lib/db/types';

/**
 * Mock data specifically for chat functionality
 * This extends the seed data with additional context and speaker segments
 * that are needed for chat interactions
 */
export interface ChatMockData extends SeedData {
    mockSpeakerSegments: {
        id: string;
        text: string;
        startTime: number;
        endTime: number;
        person: {
            id: string;
            name: string;
            roles: Array<{
                party: {
                    name: string;
                };
            }>;
        } | null;
        subjectId: string;
        subjectName: string;
    }[];
}

/**
 * Load mock data for chat functionality
 * This combines seed data with additional mock data needed for chat
 */
export function loadChatMockData(): ChatMockData {
    const seedData = loadSeedData();
    
    // Add mock speaker segments to each meeting
    const mockSpeakerSegments = seedData.meetings.flatMap(meeting => {
        return meeting.subjects.map((subject, subjectIndex) => ({
            id: `mock-segment-${meeting.id}-${subjectIndex}`,
            text: `This is a mock segment discussing ${subject.name}. ${subject.description}`,
            startTime: subjectIndex * 60, // 1 minute intervals
            endTime: (subjectIndex + 1) * 60,
            person: meeting.administrativeBody ? {
                id: `mock-person-${meeting.id}-${subjectIndex}`,
                name: `Mock Speaker ${subjectIndex + 1}`,
                roles: [{
                    party: {
                        name: 'Mock Party'
                    }
                }]
            } : null,
            subjectId: subject.id,
            subjectName: subject.name
        }));
    });

    return {
        ...seedData,
        mockSpeakerSegments
    };
}

/**
 * Convert a subject to a SearchResultDetailed
 */
function subjectToSearchResult(
    subject: Subject, 
    meeting: MeetingWithAllData, 
    city: City,
    score: number = 0.8
): SearchResultDetailed {
    // Create a base subject with relations
    const subjectWithRelations: SubjectWithRelations = {
        ...subject,
        contributions: [],
        speakerSegments: [],
        highlights: [],
        location: null,
        topic: null,
        introducedBy: null
    };

    // Create the search result
    return {
        ...subjectWithRelations,
        score,
        matchedSpeakerSegmentIds: [],
        councilMeeting: {
            ...meeting,
            city
        },
        speakerSegments: [],
        context: `This subject was discussed in the ${meeting.name} meeting.`
    };
}

/**
 * Find mock speaker segments for a specific meeting
 */
export function findMockSpeakerSegments(meetingId: string) {
    const mockData = loadChatMockData();
    return mockData.mockSpeakerSegments.filter(segment => 
        segment.id.startsWith(`mock-segment-${meetingId}`)
    );
}

/**
 * Find mock speaker segments that mention a specific subject
 */
export function findMockSpeakerSegmentsForSubject(subjectName: string) {
    const mockData = loadChatMockData();
    console.log('🔍 Searching for subject:', subjectName);
    
    const matchingSegments = mockData.mockSpeakerSegments.filter(segment => {
        const exactMatch = segment.subjectName === subjectName;
        const textMatch = segment.text.includes(subjectName);
        return exactMatch || textMatch;
    });

    console.log('✅ Found matching segments:', matchingSegments.length);
    return matchingSegments;
}

/**
 * Find subjects that match a search query and convert them to SearchResultDetailed
 */
export function findSubjectsByQuery(query: string, cityId?: string): SearchResultDetailed[] {
    const data = loadSeedData();
    const searchTerms = query.toLowerCase().split(' ');
    
    // Get all subjects from relevant meetings
    const allSubjects = data.meetings
        .filter(meeting => !cityId || meeting.cityId === cityId)
        .flatMap(meeting => {
            const city = data.cities.find(c => c.id === meeting.cityId);
            if (!city) return [];
            return meeting.subjects?.map(subject => ({
                subject,
                meeting,
                city
            })) || [];
        });
    
    // If no search terms, return random subjects
    if (searchTerms.length === 0) {
        return getRandomItems(allSubjects, 3).map(({ subject, meeting, city }) => 
            subjectToSearchResult(subject, meeting, city)
        );
    }
    
    // Find matching subjects
    const matchingSubjects = allSubjects.filter(({ subject }) => {
        const subjectText = `${subject.name} ${subject.description}`.toLowerCase();
        return searchTerms.every(term => subjectText.includes(term));
    });
    
    // If we have matches, return 1-3 random matches
    if (matchingSubjects.length > 0) {
        return getRandomItems(matchingSubjects, Math.floor(Math.random() * 3) + 1)
            .map(({ subject, meeting, city }) => subjectToSearchResult(subject, meeting, city));
    }
    
    // If no matches, return 1-2 random subjects anyway
    return getRandomItems(allSubjects, Math.floor(Math.random() * 2) + 1)
        .map(({ subject, meeting, city }) => subjectToSearchResult(subject, meeting, city));
}

/**
 * Mock responses for different types of queries
 */
const MOCK_RESPONSES = {
    general: "Αυτή είναι μια γενική απάντηση για το θέμα του δημοτικού συμβουλίου. Το συμβούλιο συζητά σημαντικά θέματα που αφορούν την πόλη και τους κατοίκους της.",
    
    subject: (subjectName: string) => 
        `Το θέμα "${subjectName}" συζητήθηκε στο δημοτικό συμβούλιο. Οι σύμβουλοι ανέλυσαν διάφορες πτυχές του θέματος και πήραν αποφάσεις με βάση τις συζητήσεις.`,
    
    person: (personName: string) =>
        `Ο/Η ${personName} έχει συμμετάσχει σε σημαντικές συζητήσεις στο δημοτικό συμβούλιο. Οι απόψεις του/της έχουν συμβάλει στη λήψη αποφάσεων για σημαντικά θέματα.`,
    
    party: (partyName: string) =>
        `Το κόμμα "${partyName}" έχει εκπροσωπηθεί στο δημοτικό συμβούλιο και έχει συμβάλει στη διαμόρφωση πολιτικών για την πόλη.`,
    
    error: "Συγγνώμη, δεν μπορώ να βρω πληροφορίες για αυτό το θέμα. Παρακαλώ δοκιμάστε να ρωτήσετε με διαφορετικό τρόπο."
};

/**
 * Generate a mock Claude response based on the query and context
 */
export function generateMockClaudeResponse(
    messages: ChatMessage[],
    searchResults: SearchResultDetailed[]
): AsyncGenerator<{ type: string; delta?: { text?: string } }> {
    const lastMessage = messages[messages.length - 1].content.toLowerCase();
    let response = '';

    // Determine response type based on query
    if (lastMessage.includes('σύμβουλος') || lastMessage.includes('σύμβουλο')) {
        response = MOCK_RESPONSES.person('Mock Speaker 1');
    } else if (lastMessage.includes('κόμμα') || lastMessage.includes('κομμάτων')) {
        response = MOCK_RESPONSES.party('Mock Party');
    } else if (searchResults.length > 0) {
        response = MOCK_RESPONSES.subject(searchResults[0].name);
    } else {
        response = MOCK_RESPONSES.general;
    }

    // Simulate streaming response
    return (async function* () {
        const words = response.split(' ');
        for (const word of words) {
            yield {
                type: 'content_block_delta',
                delta: { text: word + ' ' }
            };
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    })();
} 