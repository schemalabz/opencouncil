import { Prisma, PrismaClient } from '@prisma/client'
import fs from 'fs'
import { z } from 'zod'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { aiChat } from '../src/lib/ai'

// Types for GeoJSON input
type GeoJSONFeature = {
    type: 'Feature'
    properties: {
        id: number
        name: string
        'name:en'?: string | null
        population?: number | null
        [key: string]: any
    }
    geometry: {
        type: string
        coordinates: number[][][]
    }
}

type GeoJSON = {
    type: 'FeatureCollection'
    features: GeoJSONFeature[]
}

// Schema for our enhanced data
const AdminDataSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_municipality: z.string(),
    name_municipality_en: z.string(),
    timezone: z.string(),
    coordinates: z.array(z.array(z.array(z.number())))
})

type AdminData = z.infer<typeof AdminDataSchema>

const prisma = new PrismaClient()
const BATCH_SIZE = 50

async function enhanceWithAI(features: GeoJSONFeature[]): Promise<AdminData[]> {
    console.log(`Processing ${features.length} cities with AI enhancement...`)

    const systemPrompt = `You are a helpful assistant that enhances municipality data. You should return valid JSON with an array of municipality data objects.`

    const results: AdminData[] = []

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < features.length; i += BATCH_SIZE) {
        const batch = features.slice(i, i + BATCH_SIZE)
        console.log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} cities)...`)

        const municipalitiesData = batch.map(f => ({
            name: f.properties.name,
            name_en: f.properties['name:en']
        }));

        const userPrompt = `
Given this list of municipalities:
${JSON.stringify(municipalitiesData, null, 2)}

Please provide an array of objects in JSON format, where each object has:
- id (the id of the municipality, e.g. athens or thessaloniki or patra)
- name (the name of the city, e.g. Αθήνα)
- name_en (the English name of the city, e.g. Athens)
- name_municipality (full Greek name including "Δήμος")
- name_municipality_en (full English name including "Municipality")
- timezone (should be "Europe/Athens" for all Greek municipalities)

List ALL the cities in the list of the municipalities. Sometimes you can use the input data to produce the fields,
but sometimes you might have to make guesses. You were given a list of ${municipalitiesData.length} municipalities,
so your response should be an array of ${municipalitiesData.length} objects. It is important that the id is unique,
and if the city ID exists in the list of municipalities, you should use that id.
`

        const response = await aiChat<any[]>(systemPrompt, userPrompt, "Your answer in json:\n[", "[")
        const aiResponse = response.result

        console.log(`AI returned data for ${aiResponse.length} cities in this batch`)

        const batchResults = aiResponse.map((item, index) => ({
            ...item,
            coordinates: batch[index].geometry.coordinates
        }))

        results.push(...batchResults)
    }

    return results
}

async function fillData(inputFile: string) {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8')) as GeoJSON
    console.log(`Read ${data.features.length} cities from ${inputFile}`)

    const enhancedFeatures = await enhanceWithAI(data.features)

    const outputPath = inputFile.replace('.geojson', '.oc.geojson')
    fs.writeFileSync(outputPath, JSON.stringify(enhancedFeatures, null, 2))
    console.log(`Enhanced data written to ${outputPath} (${enhancedFeatures.length} cities)`)
}

async function importData(inputFile: string) {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8')) as AdminData[]
    console.log(`Read ${data.length} cities from ${inputFile}`)

    let createdCount = 0
    let updatedCount = 0

    for (const admin of data) {
        // Create the geometry value using raw SQL with proper text casting
        const geoJson = JSON.stringify({
            type: "MultiPolygon",
            coordinates: admin.coordinates
        });

        const existingCity = await prisma.city.findUnique({
            where: { id: admin.id }
        });


        if (!existingCity) {
            await prisma.city.create({
                data: {
                    id: admin.id,
                    name: admin.name,
                    name_en: admin.name_en,
                    name_municipality: admin.name_municipality,
                    name_municipality_en: admin.name_municipality_en,
                    timezone: admin.timezone,
                    isPending: true,
                    isListed: false,
                    officialSupport: false,
                }
            });
            createdCount++;

            console.log(`Created city ${admin.id}`)
        }
        else {
            console.log(`City ${admin.id} already exists`)
        }

        // Update geometry separately using raw SQL with text casting
        await prisma.$executeRaw`UPDATE "City" SET geometry = ST_GeomFromGeoJSON(${geoJson}::text) WHERE id = ${admin.id}`;
        console.log(`Updated geometry for city ${admin.id}\n`)
        if (existingCity) updatedCount++;
    }

    console.log(`Imported ${data.length} administrations (${createdCount} created, ${updatedCount} updated)`)
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('mode', {
            alias: 'm',
            choices: ['fill', 'import'] as const,
            demandOption: true,
            description: 'Mode of operation'
        })
        .option('input', {
            alias: 'i',
            type: 'string',
            demandOption: true,
            description: 'Input file path'
        })
        .argv

    if (argv.mode === 'fill') {
        await fillData(argv.input)
    } else {
        await importData(argv.input)
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
