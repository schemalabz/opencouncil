
import { Prisma } from "@prisma/client"

const userWithRelations = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    administers: {
      include: {
        city: true,
        party: {
          include: {
            city: true,
          },
        },
        person: {
          include: {
            city: true,
          },
        },
      },
    },
    notificationPreferences: {
      include: {
        city: true,
        interests: true,
        locations: true,
      },
    },
    petitions: {
      include: {
        city: true,
      },
    },
  },
})

export type UserWithRelations = Prisma.UserGetPayload<typeof userWithRelations> 