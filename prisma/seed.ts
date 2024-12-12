import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Helper function to create words
const createWords = (text: string, startTime: number, wordDuration = 5) => {
  const words = text.split(' ')
  return words.map((word, index) => ({
    text: word,
    startTimestamp: startTime + (index * wordDuration),
    endTimestamp: startTime + ((index + 1) * wordDuration),
  }))
}

// Helper function to create utterances
const createUtterance = (text: string, startTime: number, duration: number) => ({
  startTimestamp: startTime,
  endTimestamp: startTime + duration,
  text,
  words: {
    create: createWords(text, startTime)
  }
})

async function main() {
  // Create a city
  const city = await prisma.city.create({
    data: {
      name: 'Αθήνα',
      name_en: 'Athens',
      name_municipality: 'Δήμος Αθηναίων',
      name_municipality_en: 'Municipality of Athens',
      logoImage: 'https://data.opencouncil.gr/city-logos/cce17f59-3df0-406b-ad66-112e7214f9bb.png',
      timezone: 'Europe/Athens',
      officialSupport: false,
      isListed: true,
    },
  })

  // Create parties
  const parties = await Promise.all([
    prisma.party.create({
      data: {
        name: 'Πρόοδος και Ανάπτυξη',
        name_en: 'Progress and Development',
        name_short: 'ΠΑ',
        name_short_en: 'PD',
        colorHex: '#2196f3',
        cityId: city.id,
      },
    }),
    prisma.party.create({
      data: {
        name: 'Δημοτική Αναγέννηση',
        name_en: 'Municipal Renaissance',
        name_short: 'ΔΑ',
        name_short_en: 'MR',
        colorHex: '#f44336',
        cityId: city.id,
      },
    }),
    prisma.party.create({
      data: {
        name: 'Πολίτες Μπροστά',
        name_en: 'Citizens Forward',
        name_short: 'ΠΜ',
        name_short_en: 'CF',
        colorHex: '#e91e63',
        cityId: city.id,
      },
    }),
  ])

  // Create council members
  const mayor = await prisma.person.create({
    data: {
      name: 'Γεώργιος Δημητρίου',
      name_en: 'Georgios Dimitriou',
      name_short: 'Γ. Δημητρίου',
      name_short_en: 'G. Dimitriou',
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
        name: 'Ανδρέας Αντωνίου',
        name_en: 'Andreas Antoniou',
        name_short: 'Α. Αντωνίου',
        name_short_en: 'A. Antoniou',
        role: 'Δημοτικός Σύμβουλος',
        role_en: 'Council Member',
        cityId: city.id,
        partyId: parties[1].id,
      },
    }),
    prisma.person.create({
      data: {
        name: 'Ελένη Παππά',
        name_en: 'Eleni Pappa',
        name_short: 'Ε. Παππά',
        name_short_en: 'E. Pappa',
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
            createUtterance('Καλησπέρα σας. Καλώς ήρθατε στη σημερινή συνεδρίαση του δημοτικού συμβουλίου.', 0, 60),
            createUtterance('Σήμερα έχουμε πολλά σημαντικά θέματα προς συζήτηση.', 60, 30),
            createUtterance('Θα ξεκινήσουμε με το θέμα της καθαριότητας στο κέντρο της πόλης.', 90, 30)
          ]
        },
        summary: {
          create: {
            text: 'Ο Δήμαρχος καλωσορίζει το συμβούλιο και εισάγει τα θέματα της ημερήσιας διάταξης'
          },
        },
      },
    }),
    prisma.speakerSegment.create({
      data: {
        startTimestamp: 120,
        endTimestamp: 240,
        meetingId: meeting.id,
        cityId: city.id,
        speakerTagId: speakerTags[1].id,
        utterances: {
          create: [
            createUtterance('Κύριε Δήμαρχε, θα ήθελα να θέσω ένα ζήτημα σχετικά με τις δημοτικές συγκοινωνίες.', 120, 60),
            createUtterance('Οι δημότες διαμαρτύρονται για τα δρομολόγια στις απομακρυσμένες γειτονιές.', 180, 60)
          ]
        },
        summary: {
          create: {
            text: 'Ο δημοτικός σύμβουλος θέτει ζήτημα για τις δημοτικές συγκοινωνίες'
          },
        },
      },
    })
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
    prisma.topicLabel.create({
      data: {
        speakerSegmentId: segments[1].id,
        topicId: topics[1].id,
      },
    }),
  ])

  // Create highlights
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