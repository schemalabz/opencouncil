#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

/**
 * Parse command line arguments
 */
function parseArguments() {
  return yargs(hideBin(process.argv))
    .usage('Usage: $0 -s [source] -o [output] -p [pairs...]')
    .option('source', {
      alias: 's',
      type: 'string',
      description: 'Source database connection string',
      demandOption: true,
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Output JSON file path',
      default: './prisma/seed_data.json',
    })
    .option('pairs', {
      alias: 'p',
      type: 'array',
      description: 'City/Meeting pairs to include (format: cityId/meetingId or cityId/latest)',
      default: ['chania/apr2_2025', 'chania/mar19_2025'],
    })
    .example('$0 -s "postgresql://user:password@localhost:5432/db" -p chania/latest athens/latest', 'Extract data for the latest meetings in Chania and Athens')
    .example('$0 -s postgresql://user:password@localhost:5432/db -o ./custom-data.json -p chania/meeting1 chania/meeting2', 'Extract specific meetings to a custom file')
    .epilog('Note: This script extracts related data using Prisma and saves it as JSON.')
    .help()
    .argv as {
      source: string;
      output: string;
      pairs: string[];
    };
}

async function main() {
  const args = parseArguments();

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(args.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Create a Prisma client to connect to the source database
    const prisma = new PrismaClient({
      datasourceUrl: args.source,
    });

    console.log('Processing pairs:', args.pairs.join(', '));
    const extractedData = await extractDataForPairs(prisma, args.pairs);

    // Write the data to the output file
    fs.writeFileSync(args.output, JSON.stringify(extractedData, null, 2));
    console.log(`Data successfully extracted to ${args.output}`);

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('Error extracting data:', error.message);
    process.exit(1);
  }
}

/**
 * Extract data for specified city/meeting pairs
 */
async function extractDataForPairs(prisma: PrismaClient, pairsArg: string[]) {
  const pairs = await resolvePairs(prisma, pairsArg);
  
  if (pairs.length === 0) {
    throw new Error('No valid city/meeting pairs found. Please check your input.');
  }

  // Extract unique city IDs
  const cityIds = [...new Set(pairs.map(pair => pair.cityId))];
  const meetingIds = pairs.map(pair => pair.meetingId);
  
  console.log(`Processing ${pairs.length} city/meeting pairs`);
  console.log(`City IDs: ${cityIds.join(', ')}`);
  console.log(`Meeting IDs: ${meetingIds.join(', ')}`);

  // Extract all data, avoiding duplication
  // Start with core entities that don't depend on others
  const topics = await extractTopics(prisma);
  const cities = await extractCities(prisma, cityIds);
  
  // Then extract entities with one-to-many relationships
  const administrativeBodies = await extractAdministrativeBodies(prisma, cityIds);
  const parties = await extractParties(prisma, cityIds);
  const persons = await extractPersons(prisma, cityIds);
  
  // Finally extract meeting data with optimized references
  const meetings = await extractMeetings(prisma, pairs);
  
  // Create entity maps for efficient reference lookup
  const entityMaps = await createEntityMaps(prisma, {
    cityIds,
    meetingIds,
    persons,
    administrativeBodies,
    parties,
    topics
  });
  
  return {
    // Metadata
    metadata: {
      extractedAt: new Date().toISOString(),
      pairs: pairs.map(p => `${p.cityId}/${p.meetingId}`),
      schema_version: "1.0"
    },
    // Core entities
    topics,
    cities,
    administrativeBodies,
    parties,
    persons,
    meetings
  };
}

/**
 * Create maps of entity IDs to their index in the arrays
 * This helps with data deduplication
 */
async function createEntityMaps(prisma: PrismaClient, {
  cityIds,
  meetingIds,
  persons,
  administrativeBodies,
  parties,
  topics
}: {
  cityIds: string[];
  meetingIds: string[];
  persons: any[];
  administrativeBodies: any[];
  parties: any[];
  topics: any[];
}) {
  return {
    persons: persons.reduce((map: Record<string, number>, person: any, index: number) => {
      map[person.id] = index;
      return map;
    }, {}),
    
    administrativeBodies: administrativeBodies.reduce((map: Record<string, number>, body: any, index: number) => {
      map[body.id] = index;
      return map;
    }, {}),
    
    parties: parties.reduce((map: Record<string, number>, party: any, index: number) => {
      map[party.id] = index;
      return map;
    }, {}),
    
    topics: topics.reduce((map: Record<string, number>, topic: any, index: number) => {
      map[topic.id] = index;
      return map;
    }, {})
  };
}

/**
 * Resolve city/meeting pairs, handling 'latest' meeting references
 */
async function resolvePairs(prisma: PrismaClient, pairsArg: string[]): Promise<{ cityId: string; meetingId: string }[]> {
  const pairs: { cityId: string; meetingId: string }[] = [];

  for (const pairStr of pairsArg) {
    const [cityId, meetingId] = pairStr.split('/');
    if (!cityId) {
      console.warn(`Invalid pair format: ${pairStr}. Expected format: cityId/meetingId or cityId/latest`);
      continue;
    }

    // Check if the city exists
    const cityExists = await prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true }
    });

    if (!cityExists) {
      console.warn(`City ${cityId} not found in the database, skipping.`);
      continue;
    }

    if (meetingId === 'latest' || !meetingId) {
      // Find the latest meeting for this city
      const latestMeeting = await prisma.councilMeeting.findFirst({
        where: { cityId },
        orderBy: { dateTime: 'desc' },
        select: { id: true },
      });
      
      if (latestMeeting) {
        pairs.push({ cityId, meetingId: latestMeeting.id });
        console.log(`Using latest meeting for ${cityId}: ${latestMeeting.id}`);
      } else {
        console.warn(`No meetings found for city ${cityId}, skipping.`);
      }
    } else {
      // Check if the specified meeting exists
      const meetingExists = await prisma.councilMeeting.findUnique({
        where: { 
          cityId_id: {
            cityId,
            id: meetingId
          }
        },
        select: { id: true }
      });

      if (meetingExists) {
        pairs.push({ cityId, meetingId });
      } else {
        console.warn(`Meeting ${meetingId} not found for city ${cityId}, skipping.`);
      }
    }
  }

  return pairs;
}

/**
 * Extract topics data (shared across cities)
 */
async function extractTopics(prisma: PrismaClient) {
  console.log('Extracting topics...');
  return prisma.topic.findMany();
}

/**
 * Extract cities data with minimal relations
 */
async function extractCities(prisma: PrismaClient, cityIds: string[]) {
  console.log('Extracting cities...');
  return prisma.city.findMany({
    where: { id: { in: cityIds } },
    // Don't include relations here - they'll be referenced by ID
  });
}

/**
 * Extract administrative bodies with their roles
 */
async function extractAdministrativeBodies(prisma: PrismaClient, cityIds: string[]) {
  console.log('Extracting administrative bodies...');
  return prisma.administrativeBody.findMany({
    where: { cityId: { in: cityIds } },
    // Don't include roles - they're captured in persons
  });
}

/**
 * Extract parties with their roles
 */
async function extractParties(prisma: PrismaClient, cityIds: string[]) {
  console.log('Extracting parties...');
  return prisma.party.findMany({
    where: { cityId: { in: cityIds } },
    // Don't include roles - they're captured in persons
  });
}

/**
 * Extract persons with their roles, speakerTags, and voicePrints
 */
async function extractPersons(prisma: PrismaClient, cityIds: string[]) {
  console.log('Extracting persons...');
  return prisma.person.findMany({
    where: { cityId: { in: cityIds } },
    include: {
      // Include roles - these belong to the person (one-to-many)
      roles: {
        select: {
          id: true,
          cityId: true,
          partyId: true,
          administrativeBodyId: true,
          isHead: true,
          name: true,
          name_en: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
        }
      },
      // Include speakerTags - these belong to the person (one-to-many)
      speakerTags: true,
      // Include voicePrints - these belong to the person (one-to-many)
      voicePrints: {
        select: {
          id: true,
          embedding: true,
          sourceAudioUrl: true,
          startTimestamp: true,
          endTimestamp: true,
          createdAt: true,
          updatedAt: true,
          // Don't include sourceSegment which would cause duplication
          sourceSegmentId: true,
        }
      }
    }
  });
}

/**
 * Extract meetings with all related data, with optimized references
 */
async function extractMeetings(prisma: PrismaClient, pairs: { cityId: string; meetingId: string }[]) {
  console.log('Extracting meetings with related data...');
  
  const meetings = [];
  
  for (const { cityId, meetingId } of pairs) {
    console.log(`Extracting meeting ${meetingId} from city ${cityId}...`);
    
    const meeting = await prisma.councilMeeting.findUnique({
      where: { 
        cityId_id: {
          cityId,
          id: meetingId,
        }
      },
      include: {
        // Basic meeting data
        administrativeBody: {
          select: {
            id: true,
            // Don't include nested relations
          }
        },
        
        // Task statuses - these belong to the meeting (one-to-many)
        // TODO: Add task statuses to the seed data in a manageable way
        taskStatuses: false,
        
        // Speaker segments with carefully selected relations
        speakerSegments: {
          include: {
            // Just include the speakerTag ID, not the full object with person
            speakerTag: {
              select: {
                id: true,
                label: true,
                personId: true,
                // Don't include the full person object
              }
            },
            // Include utterances and words - these belong to the segment (one-to-many)
            utterances: {
              include: {
                words: true,
                // Just include IDs for highlightedUtterances to avoid duplication
                highlightedUtterances: {
                  select: {
                    id: true,
                    highlightId: true,
                  }
                }
              }
            },
            // Include summary - this belongs to the segment (one-to-one)
            summary: true,
            // Include topicLabels with minimal topic information
            topicLabels: {
              select: {
                id: true,
                topicId: true,
                // Don't include the full topic object
              }
            },
            // Include subject connections with minimal data
            subjects: {
              select: {
                id: true,
                subjectId: true,
                summary: true,
                // Don't include full subject object
              }
            }
          }
        },
        
        // Highlights with carefully selected relations
        highlights: {
          include: {
            // Just include IDs for highlightedUtterances
            highlightedUtterances: {
              select: {
                id: true,
                utteranceId: true,
              }
            },
            // Just include the subject ID
            subject: {
              select: {
                id: true,
              }
            }
          }
        },
        
        // Subjects with carefully selected relations
        subjects: {
          include: {
            // Just include the person ID
            introducedBy: {
              select: {
                id: true,
              }
            },
            // Just include the topic ID
            topic: {
              select: {
                id: true,
              }
            },
            // For locations, we'll get the ID now, but we'll fetch geometry separately below
            location: {
              select: {
                id: true,
                type: true,
                text: true,
              }
            },
            // Just include IDs for highlights
            highlights: {
              select: {
                id: true,
              }
            },
            // Just include IDs for speakerSegments
            speakerSegments: {
              select: {
                id: true,
                speakerSegmentId: true,
              }
            }
          }
        },
        
        // Podcast specs with their parts
        podcastSpecs: {
          include: {
            parts: {
              include: {
                // Just include IDs for utterances
                podcastPartAudioUtterances: {
                  select: {
                    id: true,
                    utteranceId: true,
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (meeting) {
      // Add the location data for subjects that have locations
      if (meeting.subjects && meeting.subjects.length > 0) {
        // Get location IDs for subjects that have locations
        const locationIds = meeting.subjects
          .filter(s => s.location != null)
          .map(s => s.location!.id);
        
        if (locationIds.length > 0) {
          try {
            // Get geometry data using the pattern from attachGeometryToCities and getSubjectsForMeeting
            const locationGeometry = await prisma.$queryRaw<Array<{ id: string; geojson: string }>>`
              SELECT id, ST_AsGeoJSON(coordinates)::text as geojson
              FROM "Location"
              WHERE id = ANY(${locationIds})
            `;
            
            // Merge the geometry data into the location objects
            meeting.subjects = meeting.subjects.map(subject => {
              if (subject.location != null) {
                const locationData = locationGeometry.find(l => l.id === subject.location!.id);
                if (locationData) {
                  try {
                    // Parse the GeoJSON string
                    const geoData = JSON.parse(locationData.geojson);
                    // Use any type to allow adding geoData property
                    (subject.location as any).geoData = geoData;
                  } catch (e) {
                    console.warn(`Failed to parse GeoJSON for location ${subject.location.id}`);
                  }
                }
              }
              return subject;
            });
          } catch (error) {
            console.error('Error extracting location geometry:', error);
          }
        }
      }
      
      meetings.push(meeting);
    }
  }
  
  return meetings;
}

main().catch(console.error);