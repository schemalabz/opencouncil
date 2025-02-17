import { Prisma, PrismaClient } from '@prisma/client'
import { Location } from '@prisma/client'
const prisma = new PrismaClient()

// Sample data
const SEED_DATA = {
  city: {
    id: 'seed-athens',
    name: 'Αθήνα',
    name_en: 'Athens',
    name_municipality: 'Δήμος Αθηναίων',
    name_municipality_en: 'Municipality of Athens',
    logoImage: 'https://data.opencouncil.gr/city-logos/cce17f59-3df0-406b-ad66-112e7214f9bb.png',
    timezone: 'Europe/Athens',
    officialSupport: false,
    isListed: true,
  },
  parties: [
    {
      id: 'seed-party-1',
      name: 'Πρόοδος και Ανάπτυξη',
      name_en: 'Progress and Development',
      name_short: 'ΠΑ',
      name_short_en: 'PD',
      colorHex: '#2196f3'
    },
    {
      id: 'seed-party-2',
      name: 'Δημοτική Αναγέννηση',
      name_en: 'Municipal Renaissance',
      name_short: 'ΔΑ',
      name_short_en: 'MR',
      colorHex: '#f44336'
    },
    {
      id: 'seed-party-3',
      name: 'Πολίτες Μπροστά',
      name_en: 'Citizens Forward',
      name_short: 'ΠΜ',
      name_short_en: 'CF',
      colorHex: '#e91e63'
    }
  ],
  people: [
    {
      id: 'seed-person-1',
      name: 'Γεώργιος Δημητρίου',
      name_en: 'Georgios Dimitriou',
      name_short: 'Γ. Δημητρίου',
      name_short_en: 'G. Dimitriou',
      roles: [
        {
          type: 'city',
          name: 'Δήμαρχος',
          name_en: 'Mayor',
          isHead: true
        }
      ],
      isAdministrativeRole: true,
      partyIndex: 0,
      speakerLabel: 'Δήμαρχος'
    },
    {
      id: 'seed-person-2',
      name: 'Ανδρέας Αντωνίου',
      name_en: 'Andreas Antoniou',
      name_short: 'Α. Αντωνίου',
      name_short_en: 'A. Antoniou',
      roles: [
        {
          type: 'administrative',
          name: 'Μέλος Δημοτικού Συμβουλίου',
          name_en: 'City Council Member',
          isHead: false
        }
      ],
      partyIndex: 1,
      speakerLabel: 'Δημοτικός Σύμβουλος'
    },
    {
      id: 'seed-person-3',
      name: 'Ελένη Παππά',
      name_en: 'Eleni Pappa',
      name_short: 'Ε. Παππά',
      name_short_en: 'E. Pappa',
      roles: [
        {
          type: 'administrative',
          name: 'Μέλος Δημοτικού Συμβουλίου',
          name_en: 'City Council Member',
          isHead: false
        }
      ],
      partyIndex: 2,
      speakerLabel: 'Δημοτική Σύμβουλος'
    }
  ],
  topics: [
    {
      id: 'seed-topic-1',
      name: 'Συγκοινωνίες',
      name_en: 'Transportation',
      colorHex: '#ff9800',
      icon: 'Bus'
    },
    {
      id: 'seed-topic-2',
      name: 'Οικονομικά & Προϋπολογισμός',
      name_en: 'Economy & Finance',
      colorHex: '#4caf50',
      icon: 'Banknote'
    },
    {
      id: 'seed-topic-3',
      name: 'Περιβάλλον & Πράσινο',
      name_en: 'Environment & Green Spaces',
      colorHex: '#8bc34a',
      icon: 'Tree'
    },
    {
      id: 'seed-topic-4',
      name: 'Πολιτισμός & Αθλητισμός',
      name_en: 'Culture & Sports',
      colorHex: '#9c27b0',
      icon: 'Theater'
    },
    {
      id: 'seed-topic-5',
      name: 'Καθαριότητα',
      name_en: 'Cleanliness',
      colorHex: '#03a9f4',
      icon: 'Trash'
    },
    {
      id: 'seed-topic-6',
      name: 'Κοινωνική Πολιτική',
      name_en: 'Social Policy',
      colorHex: '#e91e63',
      icon: 'Users'
    },
    {
      id: 'seed-topic-7',
      name: 'Υποδομές & Έργα',
      name_en: 'Infrastructure & Works',
      colorHex: '#795548',
      icon: 'Building'
    }
  ],
  subjects: [
    {
      id: 'seed-subject-1',
      name: 'Ανάπλαση πλατείας Συντάγματος',
      description: 'Συζήτηση για την ανάπλαση της κεντρικής πλατείας',
      location: {
        type: 'point',
        text: 'Πλατεία Συντάγματος',
        coordinates: 'POINT(23.735 37.975)'
      },
      topicIndex: 6
    },
    {
      id: 'seed-subject-2',
      name: 'Νέος ποδηλατόδρομος Πανεπιστημίου',
      description: 'Πρόταση για δημιουργία ποδηλατόδρομου',
      location: {
        type: 'point',
        text: 'Οδός Πανεπιστημίου',
        coordinates: 'POINT(23.733 37.980)'
      },
      topicIndex: 0
    }
  ]
}

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
  // Create city
  const city = await prisma.city.upsert({
    where: { id: SEED_DATA.city.id },
    update: SEED_DATA.city,
    create: SEED_DATA.city
  })

  // Create city council
  const cityCouncil = await prisma.administrativeBody.upsert({
    where: { id: 'seed-city-council' },
    update: {
      name: 'Δημοτικό Συμβούλιο',
      name_en: 'City Council',
      type: 'council',
      cityId: city.id
    },
    create: {
      id: 'seed-city-council',
      name: 'Δημοτικό Συμβούλιο',
      name_en: 'City Council',
      type: 'council',
      cityId: city.id
    }
  })

  // Create parties
  const parties = await Promise.all(
    SEED_DATA.parties.map(party =>
      prisma.party.upsert({
        where: { id: party.id },
        update: {
          name: party.name,
          name_en: party.name_en,
          name_short: party.name_short,
          name_short_en: party.name_short_en,
          colorHex: party.colorHex,
          cityId: city.id
        },
        create: {
          id: party.id,
          name: party.name,
          name_en: party.name_en,
          name_short: party.name_short,
          name_short_en: party.name_short_en,
          colorHex: party.colorHex,
          cityId: city.id
        }
      })
    )
  )

  // Create people with roles
  const people = await Promise.all(
    SEED_DATA.people.map(async person => {
      // First create the person
      const createdPerson = await prisma.person.upsert({
        where: { id: person.id },
        update: {
          name: person.name,
          name_en: person.name_en,
          name_short: person.name_short,
          name_short_en: person.name_short_en,
          isAdministrativeRole: person.isAdministrativeRole || false,
          cityId: city.id
        },
        create: {
          id: person.id,
          name: person.name,
          name_en: person.name_en,
          name_short: person.name_short,
          name_short_en: person.name_short_en,
          isAdministrativeRole: person.isAdministrativeRole || false,
          cityId: city.id
        }
      })

      // Then create their roles
      for (const role of person.roles) {
        await prisma.role.create({
          data: {
            personId: createdPerson.id,
            ...(role.type === 'city' ? { cityId: city.id } : {}),
            ...(role.type === 'administrative' ? { administrativeBodyId: cityCouncil.id } : {}),
            name: role.name,
            name_en: role.name_en,
            isHead: role.isHead
          }
        })
      }

      // Create party role if they belong to a party
      if (typeof person.partyIndex !== 'undefined') {
        await prisma.role.create({
          data: {
            personId: createdPerson.id,
            partyId: parties[person.partyIndex].id,
            isHead: false
          }
        });
      }

      return createdPerson
    })
  )

  // Create speaker tags
  const speakerTags = await Promise.all(
    SEED_DATA.people.map((person, index) =>
      prisma.speakerTag.upsert({
        where: { id: people[index].id },
        update: {
          label: person.speakerLabel,
          personId: people[index].id
        },
        create: {
          label: person.speakerLabel,
          personId: people[index].id
        }
      })
    )
  )

  // Create meeting
  const meeting = await prisma.councilMeeting.upsert({
    where: { cityId_id: { cityId: city.id, id: 'seed-meeting-1' } },
    update: {
      name: 'Συνεδρίαση Δημοτικού Συμβουλίου',
      name_en: 'City Council Meeting',
      dateTime: new Date('2024-01-15T18:00:00Z'),
      youtubeUrl: 'https://www.youtube.com/watch?v=example',
      cityId: city.id,
      released: true
    },
    create: {
      id: 'seed-meeting-1',
      name: 'Συνεδρίαση Δημοτικού Συμβουλίου',
      name_en: 'City Council Meeting',
      dateTime: new Date('2024-01-15T18:00:00Z'),
      youtubeUrl: 'https://www.youtube.com/watch?v=example',
      cityId: city.id,
      released: true
    }
  })

  // Create topics
  const topics = await Promise.all(
    SEED_DATA.topics.map(topic =>
      prisma.topic.upsert({
        where: { id: topic.id },
        update: {
          name: topic.name,
          name_en: topic.name_en,
          colorHex: topic.colorHex,
          icon: topic.icon
        },
        create: {
          id: topic.id,
          name: topic.name,
          name_en: topic.name_en,
          colorHex: topic.colorHex,
          icon: topic.icon
        }
      })
    )
  )

  // Create speaker segments with utterances and words
  const segment1 = await prisma.speakerSegment.upsert({
    where: { id: 'seed-segment-1' },
    update: {
      startTimestamp: 0,
      endTimestamp: 120,
      meetingId: meeting.id,
      cityId: city.id,
      speakerTagId: speakerTags[0].id,
      utterances: {
        deleteMany: {},
        create: [
          createUtterance('Καλησπέρα σας. Καλώς ήρθατε στη σημερινή συνεδρίαση του δημοτικού συμβουλίου.', 0, 60),
          createUtterance('Σήμερα έχουμε πολλά σημαντικά θέματα προς συζήτηση.', 60, 30),
          createUtterance('Θα ξεκινήσουμε με το θέμα της ανάπλασης της πλατείας.', 90, 30)
        ]
      },
      summary: {
        upsert: {
          create: {
            text: 'Ο Δήμαρχος καλωσορίζει το συμβούλιο και εισάγει το θέμα της ανάπλασης'
          },
          update: {
            text: 'Ο Δήμαρχος καλωσορίζει το συμβούλιο και εισάγει το θέμα της ανάπλασης'
          }
        }
      }
    },
    create: {
      id: 'seed-segment-1',
      startTimestamp: 0,
      endTimestamp: 120,
      meetingId: meeting.id,
      cityId: city.id,
      speakerTagId: speakerTags[0].id,
      utterances: {
        create: [
          createUtterance('Καλησπέρα σας. Καλώς ήρθατε στη σημερινή συνεδρίαση του δημοτικού συμβουλίου.', 0, 60),
          createUtterance('Σήμερα έχουμε πολλά σημαντικά θέματα προς συζήτηση.', 60, 30),
          createUtterance('Θα ξεκινήσουμε με το θέμα της ανάπλασης της πλατείας.', 90, 30)
        ]
      },
      summary: {
        create: {
          text: 'Ο Δήμαρχος καλωσορίζει το συμβούλιο και εισάγει το θέμα της ανάπλασης'
        }
      }
    }
  })

  const segment2 = await prisma.speakerSegment.upsert({
    where: { id: 'seed-segment-2' },
    update: {
      startTimestamp: 120,
      endTimestamp: 240,
      meetingId: meeting.id,
      cityId: city.id,
      speakerTagId: speakerTags[1].id,
      utterances: {
        deleteMany: {},
        create: [
          createUtterance('Κύριε Δήμαρχε, θα ήθελα να θέσω ένα ζήτημα σχετικά με τις δημοτικές συγκοινωνίες.', 120, 60),
          createUtterance('Οι δημότες διαμαρτύρονται για τα δρομολόγια στις απομακρυσμένες γειτονιές.', 180, 60)
        ]
      },
      summary: {
        upsert: {
          create: {
            text: 'Συζήτηση για τη δημιουργία ποδηλατόδρομου στην Πανεπιστημίου'
          },
          update: {
            text: 'Συζήτηση για τη δημιουργία ποδηλατόδρομου στην Πανεπιστημίου'
          }
        }
      }
    },
    create: {
      id: 'seed-segment-2',
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
          text: 'Συζήτηση για τη δημιουργία ποδηλατόδρομου στην Πανεπιστημίου'
        }
      }
    }
  })

  // Create topic labels for segments
  await prisma.topicLabel.upsert({
    where: { id: segment1.id },
    update: {
      speakerSegmentId: segment1.id,
      topicId: topics[6].id
    },
    create: {
      speakerSegmentId: segment1.id,
      topicId: topics[6].id
    }
  })

  await prisma.topicLabel.upsert({
    where: { id: segment2.id },
    update: {
      speakerSegmentId: segment2.id,
      topicId: topics[0].id
    },
    create: {
      speakerSegmentId: segment2.id,
      topicId: topics[0].id
    }
  })

  // Create subjects with references to existing segments
  for (const subjectData of SEED_DATA.subjects) {
    // Create location
    const location: Location = await prisma.$queryRaw`
      INSERT INTO "Location" (id, type, text, coordinates)
      VALUES (
        gen_random_uuid(), 
        ${subjectData.location.type}::\"LocationType\", 
        ${subjectData.location.text}, 
        ST_GeomFromText(${subjectData.location.coordinates})
      )
      ON CONFLICT DO NOTHING
      RETURNING id, type, text, coordinates::text
    `

    // Create subject
    const subject = await prisma.subject.upsert({
      where: { id: subjectData.id },
      update: {
        name: subjectData.name,
        description: subjectData.description,
        councilMeetingId: meeting.id,
        cityId: city.id,
        locationId: location.id,
        topicId: topics[subjectData.topicIndex].id
      },
      create: {
        id: subjectData.id,
        name: subjectData.name,
        description: subjectData.description,
        councilMeetingId: meeting.id,
        cityId: city.id,
        locationId: location.id,
        topicId: topics[subjectData.topicIndex].id
      }
    })

    // Link existing segment to subject
    try {
      await prisma.subjectSpeakerSegment.create({
        data: {
          subjectId: subject.id,
          speakerSegmentId: subjectData.id === 'seed-subject-1' ? segment1.id : segment2.id,
          summary: subjectData.id === 'seed-subject-1'
            ? 'Ο Δήμαρχος καλωσορίζει το συμβούλιο και εισάγει το θέμα της ανάπλασης'
            : 'Συζήτηση για τη δημιουργία ποδηλατόδρομου στην Πανεπιστημίου'
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        console.log('Unique constraint violation, skipping...')
      } else {
        throw error
      }
    }
  }

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