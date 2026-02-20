import {
    Topic, 
    AdministrativeBody,
    TaskStatus,
} from '@prisma/client';

// Import types first
import type { PersonWithRelations } from '../people';
import type { PartyWithPersons } from '../parties';
import type { CityWithGeometry } from '../cities';
import type { HighlightWithUtterances } from '../highlights';
import type { PodcastSpecWithRelations } from '../podcasts';
import type { SegmentWithRelations } from '../speakerSegments';
import { CouncilMeetingWithAdminBodyAndSubjects } from '../meetings';

// Re-export db types
export * from './roles';

// Pagination
export interface PaginationParams {
    currentPage: number;
    totalPages: number;
    pageSize: number;
}

// Meeting with all related data
export type MeetingWithAllData = CouncilMeetingWithAdminBodyAndSubjects & {
    speakerSegments: SegmentWithRelations[];
    highlights: HighlightWithUtterances[];
    podcastSpecs: PodcastSpecWithRelations[];
    taskStatuses: TaskStatus[];
};

/**
 * Seed data types
 */

export interface SeedData {
    metadata: {
        extractedAt: string;
        pairs: string[];
        schema_version: string;
    };
    cities: CityWithGeometry[];
    meetings: MeetingWithAllData[];
    persons: PersonWithRelations[];
    parties: PartyWithPersons[];
    topics: Topic[];
    administrativeBodies: AdministrativeBody[];
}

/**
 * Type guards and utility types
 */


export function isMeetingWithAllData(meeting: any): meeting is MeetingWithAllData {
    return meeting && 
           'subjects' in meeting && 
           'speakerSegments' in meeting && 
           'highlights' in meeting && 
           'podcastSpecs' in meeting;
} 