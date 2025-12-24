import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'
import { env } from '@/env.mjs'

const prisma = new PrismaClient()

// Configuration
const SEED_DATA_URL = env.SEED_DATA_URL
const SEED_DATA_PATH = env.SEED_DATA_PATH

/**
 * Create development test users with proper permissions
 */
async function createTestUsers() {
  // Import test user definitions
  const { TEST_USERS } = require('../src/lib/dev/test-users')
  const DEV_TEST_CITY_ID = env.DEV_TEST_CITY_ID

  console.log(`Creating development test users for city: ${DEV_TEST_CITY_ID}`)

  try {
    // Verify the test city exists
    const testCity = await prisma.city.findUnique({
      where: { id: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    if (!testCity) {
      console.log(`Test city with id "${DEV_TEST_CITY_ID}" not found. Skipping test user creation.`)
      return
    }

    // Get one party and one person from the test city for specific admin users
    const testParty = await prisma.party.findFirst({
      where: { cityId: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    const testPerson = await prisma.person.findFirst({
      where: { cityId: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    for (const testUser of TEST_USERS) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: testUser.email }
      })

      if (existingUser) {
        console.log(`Test user with email ${testUser.email} already exists`)
        continue
      }

      // Determine user name and permissions based on admin type
      let finalName = testUser.name
      let administers: any[] = []

      switch (testUser.adminType) {
        case 'superadmin':
          // Super admin needs no additional permissions
          break
        case 'city':
          administers = [{ cityId: testCity.id }]
          break
        case 'party':
          if (testParty) {
            finalName = `Party Admin (${testParty.name})`
            administers = [{ partyId: testParty.id }]
          } else {
            finalName = 'Party Admin (No party available)'
          }
          break
        case 'person':
          if (testPerson) {
            finalName = `Person Admin (${testPerson.name})`
            administers = [{ personId: testPerson.id }]
          } else {
            finalName = 'Person Admin (No person available)'
          }
          break
        case 'readonly':
          // Read-only user has no administers
          break
      }

      // Create test user
      await prisma.user.create({
        data: {
          email: testUser.email,
          name: finalName,
          isSuperAdmin: testUser.isSuperAdmin,
          onboarded: true,
          administers: {
            create: administers
          }
        }
      })

      console.log(`Created test user: ${finalName} (${testUser.email})`)
    }
  } catch (error) {
    console.error('Error creating test users:', error)
  }
}

/**
 * Seed consultations
 */
async function seedConsultations() {
  console.log('Seeding consultations...')

  // Check if Athens city exists
  const athensCity = await prisma.city.findUnique({
    where: { id: 'athens' },
    select: { id: true }
  })

  if (!athensCity) {
    console.log('Athens city not found, skipping consultation seeding')
    return
  }

  // Create sample consultation for Athens
  const consultationData = {
    id: 'scooters',
    name: 'Κανονισμός Κυκλοφορίας και Στάθμευσης Ηλεκτρικών Πατινιών',
    jsonUrl: '/regulation.json', // Served from public folder
    endDate: new Date('2027-03-31'), // Set end date to March 31, 2027
    isActive: true,
    cityId: 'athens',
  }

  try {
    await prisma.consultation.create({
      data: consultationData
    })
    console.log('Successfully created consultation for Athens')
  } catch (error) {
    console.log('Consultation may already exist, skipping...')
  }
}

/**
 * Seed voiceprints for persons
 */
async function seedVoicePrints(persons: any[]) {
  if (!persons || persons.length === 0) {
    return;
  }

  console.log('Seeding voiceprints...')

  // First, collect all voiceprints
  const allVoicePrints = persons
    .filter((person: { voicePrints?: any[] }) => person.voicePrints && person.voicePrints.length > 0)
    .flatMap((person: { id: string; voicePrints: any[] }) =>
      person.voicePrints.map((voicePrint: any) => ({
        id: voicePrint.id,
        embedding: voicePrint.embedding,
        sourceAudioUrl: voicePrint.sourceAudioUrl,
        startTimestamp: voicePrint.startTimestamp,
        endTimestamp: voicePrint.endTimestamp,
        createdAt: voicePrint.createdAt,
        updatedAt: voicePrint.updatedAt,
        sourceSegmentId: voicePrint.sourceSegmentId,
        personId: person.id,
      }))
    )

  if (allVoicePrints.length > 0) {
    console.log(`Found ${allVoicePrints.length} voiceprints to create...`)

    // Get all referenced speaker segment IDs
    const segmentIds = allVoicePrints
      .map(vp => vp.sourceSegmentId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Check which speaker segments exist
    const existingSegments = await prisma.speakerSegment.findMany({
      where: {
        id: {
          in: segmentIds
        }
      },
      select: {
        id: true
      }
    })

    const existingSegmentIds = new Set(existingSegments.map(s => s.id))

    // Filter out voiceprints with missing speaker segments
    const validVoicePrints = allVoicePrints.filter(vp => {
      if (!vp.sourceSegmentId) return true // Keep voiceprints without source segments
      return existingSegmentIds.has(vp.sourceSegmentId)
    })

    const skippedCount = allVoicePrints.length - validVoicePrints.length
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} voiceprints due to missing speaker segments`)
    }

    if (validVoicePrints.length > 0) {
      console.log(`Creating ${validVoicePrints.length} valid voiceprints...`)
      try {
        await prisma.voicePrint.createMany({
          data: validVoicePrints,
          skipDuplicates: true,
        })
        console.log('Successfully created voiceprints')
      } catch (error) {
        console.error('Error creating voiceprints:', error)
        // Continue execution - don't throw error
      }
    }
  }
}

/**
 * Main seeding function
 */
async function main() {
  try {
    // Verify Prisma client is in sync with schema
    console.log('Checking Prisma client connection...')
    await prisma.$connect()
    console.log('Successfully connected to the database.')

    // Get seed data, either from local file or by downloading it
    const seedData = await getSeedData()

    // Check if seeding has already occurred by verifying if cities and meetings exist
    const existingCities = await prisma.city.findMany({
      where: {
        id: {
          in: seedData.cities.map((city: { id: string }) => city.id)
        }
      }
    })

    const existingMeetings = await prisma.councilMeeting.findMany({
      where: {
        id: {
          in: seedData.meetings.map((meeting: { id: string }) => meeting.id)
        }
      }
    })

    // If all cities and meetings from seed data already exist, skip seeding
    if (existingCities.length === seedData.cities.length &&
      existingMeetings.length === seedData.meetings.length) {
      console.log('Database already contains all seed data. Skipping seeding...')
      return
    }

    console.log(`Seeding database with ${seedData.cities.length} cities and ${seedData.meetings.length} meetings...`)

    // First, seed core entities that don't depend on others
    await seedTopics(seedData.topics)
    await seedCities(seedData.cities)

    // Then seed entities with foreign key dependencies
    await seedAdministrativeBodies(seedData.administrativeBodies)
    await seedParties(seedData.parties)

    // Seed persons next (depends on cities and parties)
    await seedPersons(seedData.persons)

    // Finally seed meetings and related data
    await seedMeetings(seedData.meetings)

    // Seed voiceprints after speaker segments are created
    await seedVoicePrints(seedData.persons)

    // Seed consultations
    await seedConsultations()

    await createTestUsers()

    console.log('Database has been seeded! 🌱')
  } catch (error) {
    console.error('Error during seeding:', error)
    process.exit(1)
  }
}

/**
 * Get seed data from local file or download if needed
 */
async function getSeedData() {
  // Check if local file exists
  if (fs.existsSync(SEED_DATA_PATH)) {
    console.log(`Using local seed data file: ${SEED_DATA_PATH}`)
    const data = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf-8'))
    return data
  }

  // If no local file, download from URL
  console.log(`Downloading seed data from: ${SEED_DATA_URL}`)
  try {
    const response = await axios.get(SEED_DATA_URL)
    const data = response.data

    // Save to local file for future use
    const directory = path.dirname(SEED_DATA_PATH)
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
    fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(data, null, 2))

    return data
  } catch (error) {
    console.error('Failed to download seed data:', error)
    throw new Error('Could not obtain seed data. Please provide a local file or ensure the URL is accessible.')
  }
}

/**
 * Seed topics
 */
async function seedTopics(topics: any[]) {
  console.log(`Seeding ${topics.length} topics...`)

  const topicData = topics.map(topic => ({
    id: topic.id,
    name: topic.name,
    name_en: topic.name_en,
    colorHex: topic.colorHex,
    icon: topic.icon,
  }))

  await prisma.topic.createMany({
    data: topicData,
    skipDuplicates: true,
  })
}

/**
 * Seed cities
 */
async function seedCities(cities: any[]) {
  console.log(`Seeding ${cities.length} cities...`)

  const cityData = cities.map(city => ({
    id: city.id,
    name: city.name,
    name_en: city.name_en,
    name_municipality: city.name_municipality || city.name,
    name_municipality_en: city.name_municipality_en || city.name_en,
    logoImage: city.logoImage,
    timezone: city.timezone || 'Europe/Athens',
    officialSupport: city.officialSupport || false,
    isListed: city.isListed || false,
    isPending: city.isPending || false,
    authorityType: city.authorityType || 'municipality',
    wikipediaId: city.wikipediaId,
    consultationsEnabled: city.id === 'athens' ? true : false, // Enable consultations for Athens
  }))

  await prisma.city.createMany({
    data: cityData,
    skipDuplicates: true,
  })
}

/**
 * Seed administrative bodies
 */
async function seedAdministrativeBodies(bodies: any[]) {
  console.log(`Seeding ${bodies.length} administrative bodies...`)

  const bodyData = bodies.map(body => ({
    id: body.id,
    name: body.name,
    name_en: body.name_en,
    type: body.type,
    cityId: body.cityId,
  }))

  await prisma.administrativeBody.createMany({
    data: bodyData,
    skipDuplicates: true,
  })
}

/**
 * Seed parties
 */
async function seedParties(parties: any[]) {
  console.log(`Seeding ${parties.length} parties...`)

  const partyData = parties.map(party => ({
    id: party.id,
    name: party.name,
    name_en: party.name_en,
    name_short: party.name_short,
    name_short_en: party.name_short_en,
    colorHex: party.colorHex,
    logo: party.logo,
    cityId: party.cityId,
  }))

  await prisma.party.createMany({
    data: partyData,
    skipDuplicates: true,
  })
}

/**
 * Seed persons with their related roles and speaker tags
 */
async function seedPersons(persons: any[]) {
  console.log(`Seeding ${persons.length} persons...`)

  // Prepare person data without relations
  const personData = persons.map(person => ({
    id: person.id,
    name: person.name,
    name_en: person.name_en,
    name_short: person.name_short,
    name_short_en: person.name_short_en,
    image: person.image,
    activeFrom: person.activeFrom,
    activeTo: person.activeTo,
    profileUrl: person.profileUrl,
    cityId: person.cityId
  }))

  // Create all persons at once
  await prisma.person.createMany({
    data: personData,
    skipDuplicates: true,
  })

  // Now handle relations separately
  // Collect all roles from all persons
  const allRoles = persons
    .filter(person => person.roles && person.roles.length > 0)
    .flatMap(person =>
      person.roles.map((role: any) => ({
        id: role.id,
        personId: person.id,
        cityId: role.cityId,
        partyId: role.partyId,
        administrativeBodyId: role.administrativeBodyId,
        isHead: role.isHead || false,
        name: role.name,
        name_en: role.name_en,
        startDate: role.startDate,
        endDate: role.endDate,
      }))
    )

  // Collect all speaker tags from all persons
  const allSpeakerTags = persons
    .filter(person => person.speakerTags && person.speakerTags.length > 0)
    .flatMap(person =>
      person.speakerTags.map((tag: any) => ({
        id: tag.id,
        label: tag.label,
        personId: person.id,
      }))
    )

  // Create all roles at once if there are any
  if (allRoles.length > 0) {
    console.log(`Creating ${allRoles.length} roles...`)
    await prisma.role.createMany({
      data: allRoles,
      skipDuplicates: true,
    })
  }

  // Create all speaker tags at once if there are any
  if (allSpeakerTags.length > 0) {
    console.log(`Creating ${allSpeakerTags.length} speaker tags...`)
    await prisma.speakerTag.createMany({
      data: allSpeakerTags,
      skipDuplicates: true,
    })
  }
}

/**
 * Seed meetings and all related data
 */
async function seedMeetings(meetings: any[]) {
  console.log(`Seeding ${meetings.length} meetings...`)

  // Prepare meeting data for batch creation
  const meetingData = meetings.map(meeting => ({
    id: meeting.id,
    name: meeting.name,
    name_en: meeting.name_en,
    dateTime: new Date(meeting.dateTime),
    youtubeUrl: meeting.youtubeUrl,
    agendaUrl: meeting.agendaUrl,
    videoUrl: meeting.videoUrl,
    audioUrl: meeting.audioUrl,
    muxPlaybackId: meeting.muxPlaybackId,
    released: meeting.released || false,
    cityId: meeting.cityId,
    administrativeBodyId: meeting.administrativeBodyId,
  }))

  // Create all meetings at once
  try {
    await prisma.councilMeeting.createMany({
      data: meetingData,
      skipDuplicates: true,
    })
  } catch (error) {
    console.error('Error creating meetings:', error)
    return // If we can't create meetings, no point in continuing
  }

  // Create task statuses for all meetings
  const allTaskStatuses = meetings
    .filter(meeting => meeting.taskStatuses && meeting.taskStatuses.length > 0)
    .flatMap(meeting =>
      meeting.taskStatuses.map((status: any) => ({
        id: status.id,
        status: status.status,
        stage: status.stage,
        percentComplete: status.percentComplete,
        type: status.type,
        requestBody: status.requestBody,
        responseBody: status.responseBody,
        version: status.version,
        councilMeetingId: meeting.id,
        cityId: meeting.cityId,
      }))
    )

  if (allTaskStatuses.length > 0) {
    console.log(`Creating ${allTaskStatuses.length} task statuses...`)
    try {
      await prisma.taskStatus.createMany({
        data: allTaskStatuses,
        skipDuplicates: true,
      })
    } catch (error) {
      console.error('Error creating task statuses:', error)
      // Continue anyway, as this is not critical
    }
  }

  // Process each meeting's data in the correct order to respect foreign key dependencies:
  // 1. Subjects (needed by speaker segments, highlights)
  // 2. Speaker segments (needed by utterances, words, etc.)
  // 3. Highlights (references subjects and utterances)
  // 4. Podcast specs (references utterances)
  for (const meeting of meetings) {
    try {
      // 1. Create subjects first (needed by speaker segments and highlights)
      if (meeting.subjects && meeting.subjects.length > 0) {
        await seedSubjects(meeting.subjects, meeting)
      }

      // 2. Create speaker segments and related data
      if (meeting.speakerSegments && meeting.speakerSegments.length > 0) {
        await seedSpeakerSegments(meeting.speakerSegments, meeting)
      }

      // 3. Create highlights with their utterance connections
      if (meeting.highlights && meeting.highlights.length > 0) {
        await seedHighlights(meeting.highlights, meeting)
      }

      // 4. Create podcast specs and parts
      if (meeting.podcastSpecs && meeting.podcastSpecs.length > 0) {
        await seedPodcastSpecs(meeting.podcastSpecs, meeting)
      }
    } catch (error) {
      console.error(`Error processing meeting ${meeting.id}:`, error)
      // Continue with next meeting
    }
  }
}

/**
 * Seed subjects for a meeting
 */
async function seedSubjects(subjects: any[], meeting: any) {
  console.log(`Seeding ${subjects.length} subjects for meeting ${meeting.id}...`)

  let locationsCreated = 0;

  // Handle locations with postgis geometry that requires raw SQL
  for (const subject of subjects) {
    if (subject.location) {
      try {
        // Use the geoData if available, otherwise create default GeoJSON
        const geoJson = subject.location.geoData || {
          type: 'Point',
          coordinates: [24.0195, 35.5139] // Default coordinates for Chania
        };

        // Create a unique ID for the location if not provided
        const locationId = subject.location.id || subject.locationId || `loc_${subject.id}`;

        // Insert location using ST_GeomFromGeoJSON like in utils.ts
        const result = await prisma.$queryRaw<[{ id: string }]>`
          INSERT INTO "Location" (
            id, 
            type, 
            text, 
            coordinates
          )
          VALUES (
            ${locationId}, 
            ${subject.location.type}::"LocationType", 
            ${subject.location.text || 'Default location'}, 
            ST_GeomFromGeoJSON(${JSON.stringify(geoJson)})
          )

          RETURNING id
        `;

        if (result && Array.isArray(result) && result.length > 0) {
          subject.locationId = result[0]?.id;
          locationsCreated++;
        }
      } catch (error) {
        console.error(`Error creating location for subject ${subject.id}:`, error);
        subject.locationId = null;
      }
    }
  }

  if (locationsCreated > 0) {
    console.log(`Created ${locationsCreated} locations for meeting ${meeting.id}`);
  }

  // Create all subjects
  const validSubjectData = subjects.map(subject => ({
    id: subject.id,
    name: subject.name,
    description: subject.description,
    hot: subject.hot || false,
    agendaItemIndex: subject.agendaItemIndex,
    nonAgendaReason: subject.nonAgendaReason,
    topicId: subject.topicId,
    locationId: subject.locationId,
    personId: subject.personId,
    context: subject.context,
    contextCitationUrls: subject.contextCitationUrls || [],
    councilMeetingId: meeting.id,
    cityId: meeting.cityId,
  }));

  await prisma.subject.createMany({
    data: validSubjectData,
    skipDuplicates: true,
  });
}

/**
 * Seed speaker segments and their related data (utterances, words, etc.)
 */
async function seedSpeakerSegments(segments: any[], meeting: any) {
  console.log(`Seeding ${segments.length} speaker segments for meeting ${meeting.id}...`)

  // First, ensure all speaker tags exist
  // Extract unique speaker tags that might not have been created yet
  const speakerTagsToCreate = segments
    .filter(segment => segment.speakerTag && segment.speakerTag.id)
    .map(segment => ({
      id: segment.speakerTag.id,
      label: segment.speakerTag.label || null,
      personId: segment.speakerTag.personId || null,
    }));

  if (speakerTagsToCreate.length > 0) {
    // Use Set to store unique tag IDs we've seen
    const uniqueTagIds = new Set<string>();
    const uniqueTags = [];

    // Filter for unique tags only
    for (const tag of speakerTagsToCreate) {
      if (!uniqueTagIds.has(tag.id)) {
        uniqueTagIds.add(tag.id);
        uniqueTags.push(tag);
      }
    }

    console.log(`Ensuring ${uniqueTags.length} speaker tags exist before creating segments...`);

    // Create missing speaker tags in batches
    try {
      await prisma.speakerTag.createMany({
        data: uniqueTags,
        skipDuplicates: true,
      });
    } catch (error) {
      console.error('Error creating speaker tags:', error);
      // Continue anyway, as the tags might already exist
    }
  }

  // Prepare speaker segment data for batch creation
  const segmentData = segments.map(segment => ({
    id: segment.id,
    startTimestamp: segment.startTimestamp,
    endTimestamp: segment.endTimestamp,
    meetingId: meeting.id,
    cityId: meeting.cityId,
    speakerTagId: segment.speakerTagId || segment.speakerTag.id,
  }))

  // Create all speaker segments at once
  await prisma.speakerSegment.createMany({
    data: segmentData,
    skipDuplicates: true,
  })

  // Create summaries for segments
  const summaries = segments
    .filter(segment => segment.summary)
    .map(segment => ({
      id: segment.summary.id,
      text: segment.summary.text,
      type: segment.summary.type,
      speakerSegmentId: segment.id,
    }))

  if (summaries.length > 0) {
    console.log(`Creating ${summaries.length} summaries...`)
    await prisma.summary.createMany({
      data: summaries,
      skipDuplicates: true,
    })
  }

  // Create topic labels for segments
  const topicLabels = segments
    .filter(segment => segment.topicLabels && segment.topicLabels.length > 0)
    .flatMap(segment =>
      segment.topicLabels.map((label: any) => ({
        id: label.id,
        speakerSegmentId: segment.id,
        topicId: label.topicId,
      }))
    )

  if (topicLabels.length > 0) {
    console.log(`Creating ${topicLabels.length} topic labels...`)
    await prisma.topicLabel.createMany({
      data: topicLabels,
      skipDuplicates: true,
    })
  }

  // Create subject connections for segments
  const subjectConnections = segments
    .filter(segment => segment.subjects && segment.subjects.length > 0)
    .flatMap(segment =>
      segment.subjects.map((subjectConnection: any) => ({
        id: subjectConnection.id,
        subjectId: subjectConnection.subjectId,
        speakerSegmentId: segment.id,
        summary: subjectConnection.summary,
      }))
    )

  if (subjectConnections.length > 0) {
    console.log(`Creating ${subjectConnections.length} subject connections...`)
    await prisma.subjectSpeakerSegment.createMany({
      data: subjectConnections,
      skipDuplicates: true,
    })
  }

  // Create all utterances and then their words
  // First collect all utterances from all segments
  const utterances = segments
    .filter(segment => segment.utterances && segment.utterances.length > 0)
    .flatMap(segment =>
      segment.utterances.map((utterance: any) => ({
        id: utterance.id,
        startTimestamp: utterance.startTimestamp,
        endTimestamp: utterance.endTimestamp,
        text: utterance.text,
        drift: utterance.drift || 0,
        uncertain: utterance.uncertain || false,
        lastModifiedBy: utterance.lastModifiedBy,
        speakerSegmentId: segment.id,
        _words: utterance.words || [], // Temporary property to track words for later
      }))
    )

  if (utterances.length > 0) {
    console.log(`Creating ${utterances.length} utterances...`)

    // Create utterances without the temporary _words property
    try {
      await prisma.utterance.createMany({
        data: utterances.map(u => {
          const { _words, ...utteranceData } = u;
          return utteranceData;
        }),
        skipDuplicates: true,
      })

      // Now create words for utterances
      const words = utterances
        .filter(u => u._words && u._words.length > 0)
        .flatMap(utterance =>
          utterance._words.map((word: any) => ({
            id: word.id,
            text: word.text,
            startTimestamp: word.startTimestamp,
            endTimestamp: word.endTimestamp,
            confidence: word.confidence || 1,
            utteranceId: utterance.id,
          }))
        )

      if (words.length > 0) {
        console.log(`Creating ${words.length} words...`)
        try {
          await prisma.word.createMany({
            data: words,
            skipDuplicates: true,
          })
        } catch (error) {
          console.error('Error creating words:', error)
          // Continue anyway, as this is not critical
        }
      }
    } catch (error) {
      console.error('Error creating utterances:', error)
      // Continue with other operations
    }
  }
}

/**
 * Seed highlights and their utterance connections
 */
async function seedHighlights(highlights: any[], meeting: any) {
  console.log(`Seeding ${highlights.length} highlights for meeting ${meeting.id}...`)

  // Prepare highlight data for batch creation
  const highlightData = highlights.map(highlight => ({
    id: highlight.id,
    name: highlight.name,
    meetingId: meeting.id,
    cityId: meeting.cityId,
    subjectId: highlight.subjectId,
    videoUrl: highlight.videoUrl,
    muxPlaybackId: highlight.muxPlaybackId,
    isShowcased: highlight.isShowcased || false,
  }))

  // Create all highlights at once
  try {
    await prisma.highlight.createMany({
      data: highlightData,
      skipDuplicates: true,
    })

    // Collect all highlighted utterance connections
    const allHighlightedUtterances = highlights
      .filter(highlight => highlight.highlightedUtterances && highlight.highlightedUtterances.length > 0)
      .flatMap(highlight =>
        highlight.highlightedUtterances.map((hu: any) => ({
          id: hu.id,
          utteranceId: hu.utteranceId,
          highlightId: highlight.id,
        }))
      )

    // Create all highlighted utterance connections at once if there are any
    if (allHighlightedUtterances.length > 0) {
      console.log(`Creating ${allHighlightedUtterances.length} highlighted utterance connections...`)
      try {
        await prisma.highlightedUtterance.createMany({
          data: allHighlightedUtterances,
          skipDuplicates: true,
        })
      } catch (error) {
        console.error('Error creating highlighted utterance connections:', error)
      }
    }
  } catch (error) {
    console.error('Error creating highlights:', error)
  }
}

/**
 * Seed podcast specs and parts
 */
async function seedPodcastSpecs(podcastSpecs: any[], meeting: any) {
  console.log(`Seeding ${podcastSpecs.length} podcast specs for meeting ${meeting.id}...`)

  // Prepare podcast spec data for batch creation
  const specData = podcastSpecs.map(spec => ({
    id: spec.id,
    councilMeetingId: meeting.id,
    cityId: meeting.cityId,
  }))

  // Create all podcast specs at once
  try {
    await prisma.podcastSpec.createMany({
      data: specData,
      skipDuplicates: true,
    })

    // Collect all podcast parts from all specs
    const allParts = podcastSpecs
      .filter(spec => spec.parts && spec.parts.length > 0)
      .flatMap(spec =>
        spec.parts.map((part: any) => ({
          id: part.id,
          type: part.type,
          text: part.text,
          audioSegmentUrl: part.audioSegmentUrl,
          duration: part.duration,
          startTimestamp: part.startTimestamp,
          endTimestamp: part.endTimestamp,
          index: part.index,
          podcastSpecId: spec.id,
          _utterances: part.podcastPartAudioUtterances || [], // Temporary property to track utterances
        }))
      )

    if (allParts.length > 0) {
      console.log(`Creating ${allParts.length} podcast parts...`)

      try {
        // Create parts without the temporary _utterances property
        await prisma.podcastPart.createMany({
          data: allParts.map(p => {
            const { _utterances, ...partData } = p;
            return partData;
          }),
          skipDuplicates: true,
        })

        // Create podcast part audio utterances
        const allUtteranceConnections = allParts
          .filter(part => part._utterances && part._utterances.length > 0)
          .flatMap(part =>
            part._utterances.map((ppau: any) => ({
              id: ppau.id,
              podcastPartId: part.id,
              utteranceId: ppau.utteranceId,
            }))
          )

        if (allUtteranceConnections.length > 0) {
          console.log(`Creating ${allUtteranceConnections.length} podcast part audio utterance connections...`)
          try {
            await prisma.podcastPartAudioUtterance.createMany({
              data: allUtteranceConnections,
              skipDuplicates: true,
            })
          } catch (error) {
            console.error('Error creating podcast part audio utterance connections:', error)
          }
        }
      } catch (error) {
        console.error('Error creating podcast parts:', error)
      }
    }
  } catch (error) {
    console.error('Error creating podcast specs:', error)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })