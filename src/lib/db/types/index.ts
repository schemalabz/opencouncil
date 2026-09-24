import {
    Topic, 
    AdministrativeBody,
    TaskStatus,
} from '@prisma/client';

// Import types first
import type { PersonWithRelations } from '@/lib/db/people';
import type { PartyWithPersons } from '@/lib/db/parties';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { HighlightWithUtterances } from '@/lib/db/highlights';
import type { SegmentWithRelations } from '@/lib/db/speakerSegments';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';

// Re-export db types
export * from './roles';
export * from './contribution';
export * from './meetingSummary';

// Pagination
export type { PaginationParams } from "../../../../packages/ui/src/lib/pagination";

// Meeting with all related data
export type MeetingWithAllData = CouncilMeetingWithAdminBodyAndSubjects & {
    speakerSegments: SegmentWithRelations[];
    highlights: HighlightWithUtterances[];
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
export * from './meeting';
