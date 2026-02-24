import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// Configuration (defaults match env.mjs)
const DIAVGEIA_MUNICIPALITIES_PATH =
  process.env.DIAVGEIA_MUNICIPALITIES_PATH || './prisma/diavgeia_municipalities.json'
const DIAVGEIA_MUNICIPALITIES_URL =
  process.env.DIAVGEIA_MUNICIPALITIES_URL ||
  'https://raw.githubusercontent.com/schemalabz/opencouncil-seed-data/refs/heads/main/diavgeia_municipalities.json'

// Types for the municipalities JSON
type DiavgeiaUnit = {
  uid: string
  label: string
}

type DiavgeiaMunicipality = {
  uid: string
  label: string
  units: DiavgeiaUnit[]
}

const prisma = new PrismaClient()

// Known abbreviations used in Diavgeia unit labels (normalized)
const ABBREVIATIONS: Record<string, string> = {
  'ΔΣ': 'ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ',
  'ΔΕ': 'ΔΗΜΟΤΙΚΗ ΕΠΙΤΡΟΠΗ',
}

/**
 * Strip accents and convert to uppercase for Greek text comparison.
 * e.g. "Δήμος Ζωγράφου" → "ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ"
 */
function normalizeGreek(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

/**
 * Load municipalities data from local file or download from GitHub.
 * Same pattern as getSeedData() in prisma/seed.ts.
 */
async function getMunicipalitiesData(): Promise<DiavgeiaMunicipality[]> {
  if (fs.existsSync(DIAVGEIA_MUNICIPALITIES_PATH)) {
    console.log(`Using local file: ${DIAVGEIA_MUNICIPALITIES_PATH}`)
    return JSON.parse(fs.readFileSync(DIAVGEIA_MUNICIPALITIES_PATH, 'utf-8'))
  }

  console.log(`Downloading from: ${DIAVGEIA_MUNICIPALITIES_URL}`)
  try {
    const axios = (await import('axios')).default
    const response = await axios.get(DIAVGEIA_MUNICIPALITIES_URL)
    const data = response.data

    // Cache locally for future runs
    const directory = path.dirname(DIAVGEIA_MUNICIPALITIES_PATH)
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
    fs.writeFileSync(DIAVGEIA_MUNICIPALITIES_PATH, JSON.stringify(data, null, 2))

    return data
  } catch (error) {
    console.error('Failed to download municipalities data:', error)
    throw new Error(
      'Could not obtain municipalities data. Please provide a local file or ensure the URL is accessible.'
    )
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Show matches without writing to the database',
    })
    .option('force', {
      type: 'boolean',
      default: false,
      description: 'Overwrite existing Diavgeia UIDs in the database',
    })
    .argv

  const dryRun = argv['dry-run']
  const force = argv['force']
  if (dryRun) {
    console.log('=== DRY RUN MODE — no database changes will be made ===\n')
  }

  // Step 1: Load data
  const municipalities = await getMunicipalitiesData()
  console.log(`Loaded ${municipalities.length} Diavgeia municipalities\n`)

  // Step 2: Match cities
  const cities = await prisma.city.findMany({
    select: { id: true, name: true, name_municipality: true, diavgeiaUid: true },
  })
  console.log(`Found ${cities.length} cities in database\n`)

  // Build a lookup: normalized municipality label → municipality
  const municipalityByLabel = new Map<string, DiavgeiaMunicipality>()
  for (const m of municipalities) {
    municipalityByLabel.set(normalizeGreek(m.label), m)
  }

  let citiesMatched = 0
  let citiesMissed = 0
  let citiesSkipped = 0
  let bodiesMatched = 0
  let bodiesMissed = 0
  let bodiesSkipped = 0

  for (const city of cities) {
    const normalizedCityName = normalizeGreek(city.name_municipality)
    const municipality = municipalityByLabel.get(normalizedCityName)

    if (!municipality) {
      console.log(`  ✗ City "${city.name_municipality}" (${city.id}) — no Diavgeia match`)
      citiesMissed++
      continue
    }

    if (city.diavgeiaUid && !force) {
      console.log(
        `  ~ City "${city.name_municipality}" (${city.id}) — already has uid ${city.diavgeiaUid}, skipping`
      )
      citiesSkipped++
    } else {
      console.log(
        `  ✓ City "${city.name_municipality}" (${city.id}) → uid ${municipality.uid}`
      )
      citiesMatched++

      if (!dryRun) {
        await prisma.city.update({
          where: { id: city.id },
          data: { diavgeiaUid: municipality.uid },
        })
      }
    }

    // Step 3: Match administrative bodies for this city
    const bodies = await prisma.administrativeBody.findMany({
      where: { cityId: city.id },
      select: { id: true, name: true, diavgeiaUnitIds: true },
    })

    // Build a lookup: normalized unit label → unit
    const unitByLabel = new Map<string, DiavgeiaUnit>()
    for (const unit of municipality.units) {
      unitByLabel.set(normalizeGreek(unit.label), unit)
    }

    for (const body of bodies) {
      const normalizedBodyName = normalizeGreek(body.name)
      // Exact match first, then substring match (Diavgeia labels often
      // include the municipality name, e.g. "ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ ΔΗΜΟΥ ΑΡΓΟΥΣ - ΜΥΚΗΝΩΝ")
      // Find the abbreviation that maps to this body name, if any
      const abbrev = Object.entries(ABBREVIATIONS).find(
        ([, full]) => full === normalizedBodyName
      )?.[0]

      const unit =
        unitByLabel.get(normalizedBodyName) ??
        municipality.units.find((u) => {
          const normalized = normalizeGreek(u.label)
          if (normalized.includes(normalizedBodyName)) return true
          // Check if a known abbreviation for this body appears as a word in the label
          if (abbrev) {
            const words = normalized.split(/\s+/)
            return words.includes(abbrev)
          }
          return false
        })

      if (!unit) {
        console.log(`      ✗ Body "${body.name}" — no Diavgeia unit match`)
        bodiesMissed++
        continue
      }

      if (body.diavgeiaUnitIds.length > 0 && !force) {
        console.log(
          `      ~ Body "${body.name}" — already has uids [${body.diavgeiaUnitIds.join(', ')}], skipping`
        )
        bodiesSkipped++
      } else {
        console.log(`      ✓ Body "${body.name}" → unit uid ${unit.uid} ("${unit.label}")`)
        bodiesMatched++

        if (!dryRun) {
          await prisma.administrativeBody.update({
            where: { id: body.id },
            data: { diavgeiaUnitIds: [unit.uid] },
          })
        }
      }
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Cities:  ${citiesMatched} matched, ${citiesSkipped} skipped, ${citiesMissed} missed (of ${cities.length})`)
  console.log(`Bodies:  ${bodiesMatched} matched, ${bodiesSkipped} skipped, ${bodiesMissed} missed`)
  if (dryRun) {
    console.log('\nDry run complete — no changes were written.')
  } else {
    console.log('\nImport complete.')
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
