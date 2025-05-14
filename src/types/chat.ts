import { City, CouncilMeeting, Party, Topic } from "@prisma/client";
import { PersonWithRelations } from '@/lib/db/people';
import { SegmentWithRelations } from "@/lib/db/speakerSegments";

export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    subjectReferences?: EnhancedSubject[];
    done?: boolean;
    error?: boolean;
}

export interface EnhancedSubject {
    id: string;
    name: string;
    description: string;
    councilMeeting: CouncilMeeting & {
        city: City;
    };
    topic: Topic | null;
    introducedBy?: PersonWithRelations;
    location?: {
        text: string;
        geojson: string;
    };
    speakerSegments: Array<SegmentWithRelations>;
    city: City;
    meeting: CouncilMeeting;
    parties: Party[];
    persons: PersonWithRelations[];
}

export interface StreamData {
    id: string;
    role: 'assistant';
    content: string;
    done: boolean;
    subjectReferences?: EnhancedSubject[];
    error?: boolean;
} 