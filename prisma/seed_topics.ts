import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TOPICS = [
    {
        id: 'administration',
        name: 'Διοίκηση',
        name_en: 'Administration',
        colorHex: '#607D8B',
        icon: 'Building2'
    },
    {
        id: 'budget-and-economy',
        name: 'Προϋπολογισμός & Οικονομία',
        name_en: 'Budget & Economy',
        colorHex: '#4CAF50',
        icon: 'Wallet'
    },
    {
        id: 'cleanliness-and-waste',
        name: 'Καθαριότητα & Απορρίμματα',
        name_en: 'Cleanliness & Waste',
        colorHex: '#795548',
        icon: 'Recycle'
    },
    {
        id: 'culture-and-sports',
        name: 'Πολιτισμός & Αθλητισμός',
        name_en: 'Culture & Sports',
        colorHex: '#9C27B0',
        icon: 'Music2'
    },
    {
        id: 'education',
        name: 'Παιδεία',
        name_en: 'Education',
        colorHex: '#FF9800',
        icon: 'GraduationCap'
    },
    {
        id: 'engagement-and-digital',
        name: 'Συμμετοχή & Ψηφιακά',
        name_en: 'Engagement & Digital',
        colorHex: '#00BCD4',
        icon: 'Users'
    },
    {
        id: 'environment',
        name: 'Περιβάλλον',
        name_en: 'Environment',
        colorHex: '#8BC34A',
        icon: 'Leaf'
    },
    {
        id: 'public-safety',
        name: 'Δημόσια Ασφάλεια',
        name_en: 'Public Safety',
        colorHex: '#F44336',
        icon: 'Shield'
    },
    {
        id: 'transportation',
        name: 'Συγκοινωνίες',
        name_en: 'Transportation',
        colorHex: '#2196F3',
        icon: 'Bus'
    },
    {
        id: 'urban-planning',
        name: 'Πολεοδομία',
        name_en: 'Urban Planning',
        colorHex: '#9E9E9E',
        icon: 'Building'
    },
    {
        id: 'welfare',
        name: 'Πρόνοια',
        name_en: 'Welfare',
        colorHex: '#E91E63',
        icon: 'Heart'
    }
]

async function main() {
    // Create topics
    await Promise.all(
        TOPICS.map(topic =>
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

    console.log('Topics have been seeded! 🌱')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    }) 