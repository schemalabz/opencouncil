import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Create a city
  const city = await prisma.city.create({
    data: {
      name: 'Αθήνα',
      name_en: 'Athens',
      name_municipality: 'Δήμος Αθηναίων',
      name_municipality_en: 'Municipality of Athens',
      logoImage: 'https://www.cityofathens.gr/sites/default/files/styles/large/public/2020-03/dimos_athinaiwn_sima.png',
      timezone: 'Europe/Athens',
      officialSupport: false,
      isListed: true,
    },
  })

  // Create parties
  const parties = await Promise.all([
    prisma.party.create({
      data: {
        name: 'Αθήνα Ψηλά',
        name_en: 'Athens High',
        name_short: 'ΑΨ',
        name_short_en: 'AH',
        colorHex: '#2196f3',
        cityId: city.id,
      },
    }),
    prisma.party.create({
      data: {
        name: 'Ανοιχτή Πόλη',
        name_en: 'Open City',
        name_short: 'ΑΠ',
        name_short_en: 'OC',
        colorHex: '#f44336',
        cityId: city.id,
      },
    }),
    prisma.party.create({
      data: {
        name: 'Λαϊκή Συσπείρωση',
        name_en: 'Popular Rally',
        name_short: 'ΛΣ',
        name_short_en: 'PR',
        colorHex: '#e91e63',
        cityId: city.id,
      },
    }),
  ])

  // Create council members
  const mayor = await prisma.person.create({
    data: {
      name: 'Κώστας Μπακογιάννης',
      name_en: 'Kostas Bakoyannis',
      name_short: 'Κ. Μπακογιάννης',
      name_short_en: 'K. Bakoyannis',
      role: 'Δήμαρχος',
      role_en: 'Mayor',
      isAdministrativeRole: true,
      cityId: city.id,
      partyId: parties[0].id,
    },
  })

  const members = await Promise.all([
    prisma.person.create({
      data: {
        name: 'Νίκος Παπαδάκης',
        name_en: 'Nikos Papadakis',
        name_short: 'Ν. Παπαδάκης',
        name_short_en: 'N. Papadakis',
        role: 'Δημοτικός Σύμβουλος',
        role_en: 'Council Member',
        cityId: city.id,
        partyId: parties[1].id,
      },
    }),
    prisma.person.create({
      data: {
        name: 'Μαρία Κουτσούρη',
        name_en: 'Maria Koutsouri',
        name_short: 'Μ. Κουτσούρη',
        name_short_en: 'M. Koutsouri',
        role: 'Δημοτική Σύμβουλος',
        role_en: 'Council Member',
        cityId: city.id,
        partyId: parties[2].id,
      },
    }),
  ])

  // Create speaker tags
  const speakerTags = await Promise.all([
    prisma.speakerTag.create({
      data: {
        label: 'Δήμαρχος',
        personId: mayor.id,
      },
    }),
    prisma.speakerTag.create({
      data: {
        label: 'Δημοτικός Σύμβουλος',
        personId: members[0].id,
      },
    }),
    prisma.speakerTag.create({
      data: {
        label: 'Δημοτική Σύμβουλος',
        personId: members[1].id,
      },
    }),
  ])

  // Create a council meeting
  const meeting = await prisma.councilMeeting.create({
    data: {
      name: 'Συνεδρίαση Δημοτικού Συμβουλίου',
      name_en: 'City Council Meeting',
      dateTime: new Date('2024-01-15T18:00:00Z'),
      youtubeUrl: 'https://www.youtube.com/watch?v=example',
      cityId: city.id,
      released: true,
    },
  })

  // Create speaker segments with utterances
  const segments = await Promise.all([
    prisma.speakerSegment.create({
      data: {
        startTimestamp: 0,
        endTimestamp: 120,
        meetingId: meeting.id,
        cityId: city.id,
        speakerTagId: speakerTags[0].id,
        utterances: {
          create: [
            {
              startTimestamp: 0,
              endTimestamp: 60,
              text: 'Καλησπέρα σας. Καλώς ήρθατε στη σημερινή συνεδρίαση του δημοτικού συμβουλίου.',
              words: {
                create: [
                  {
                    text: 'Καλησπέρα',
                    startTimestamp: 0,
                    endTimestamp: 10,
                  },
                  {
                    text: 'σας',
                    startTimestamp: 10,
                    endTimestamp: 15,
                  },
                ],
              },
            },
          ],
        },
        summary: {
          create: {
            text: 'Ο Δήμαρχος καλωσορίζει το συμβούλιο',
          },
        },
      },
    }),
  ])

  // Create topics
  const topics = await Promise.all([
    prisma.topic.create({
      data: {
        name: 'Καθαριότητα',
        name_en: 'Cleanliness',
        colorHex: '#4caf50',
      },
    }),
    prisma.topic.create({
      data: {
        name: 'Συγκοινωνίες',
        name_en: 'Transportation',
        colorHex: '#ff9800',
      },
    }),
  ])

  // Create topic labels
  await Promise.all([
    prisma.topicLabel.create({
      data: {
        speakerSegmentId: segments[0].id,
        topicId: topics[0].id,
      },
    }),
  ])

  // Create a highlight
  const highlight = await prisma.highlight.create({
    data: {
      name: 'Εισαγωγική τοποθέτηση Δημάρχου',
      meetingId: meeting.id,
      cityId: city.id,
      highlightedUtterances: {
        create: [
          {
            utteranceId: (await prisma.utterance.findFirst({
              where: { speakerSegmentId: segments[0].id }
            }))!.id,
          },
        ],
      },
    },
  })

  console.log('Database has been seeded! 🌱')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })