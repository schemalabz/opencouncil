#!/usr/bin/env tsx

/**
 * Validates seed data JSON against the Prisma schema using DMMF.
 *
 * For each entity type in the seed data, compares the keys present in the JSON
 * against the expected scalar/enum fields from the Prisma schema. Reports:
 * - Missing fields with defaults (OK — Prisma fills them in)
 * - Missing fields WITHOUT defaults (UNEXPECTED — real data being lost)
 * - Extra keys that are relation objects (OK — stripped by extractScalarFields)
 * - Extra keys that are unknown (WARNING — possibly stale data)
 *
 * Always exits 0 — this is informational, not blocking.
 * Use --strict to exit 1 on unexpected mismatches (for local validation after
 * regenerating a dump).
 *
 * Usage: npx tsx scripts/validate-seed-schema.ts [--strict] <path-to-seed.json>
 */

import * as fs from 'fs'
import { Prisma } from '@prisma/client'
import { getModelFieldInfo } from '../prisma/seed-utils'

// Map seed JSON keys to Prisma model names, including nested entities
interface EntityMapping {
  modelName: string
  /** FK fields injected from parent context via overrides (not in seed JSON) */
  parentOverrides?: string[]
  /** Nested entity arrays within this entity */
  nestedEntities?: Record<string, EntityMapping>
}

const ENTITY_MAPPINGS: Record<string, EntityMapping> = {
  topics: { modelName: 'Topic' },
  cities: { modelName: 'City' },
  administrativeBodies: { modelName: 'AdministrativeBody' },
  parties: { modelName: 'Party' },
  persons: {
    modelName: 'Person',
    nestedEntities: {
      roles: { modelName: 'Role', parentOverrides: ['personId'] },
      speakerTags: { modelName: 'SpeakerTag', parentOverrides: ['personId'] },
      voicePrints: { modelName: 'VoicePrint', parentOverrides: ['personId'] },
    },
  },
  meetings: {
    modelName: 'CouncilMeeting',
    nestedEntities: {
      taskStatuses: { modelName: 'TaskStatus', parentOverrides: ['councilMeetingId', 'cityId'] },
      subjects: {
        modelName: 'Subject',
        parentOverrides: ['councilMeetingId', 'cityId'],
        nestedEntities: {
          contributions: { modelName: 'SpeakerContribution', parentOverrides: ['subjectId'] },
        },
      },
      speakerSegments: {
        modelName: 'SpeakerSegment',
        parentOverrides: ['meetingId', 'cityId', 'speakerTagId'],
        nestedEntities: {
          utterances: {
            modelName: 'Utterance',
            parentOverrides: ['speakerSegmentId'],
            nestedEntities: {
              words: { modelName: 'Word', parentOverrides: ['utteranceId'] },
              highlightedUtterances: { modelName: 'HighlightedUtterance', parentOverrides: ['utteranceId'] },
            },
          },
          topicLabels: { modelName: 'TopicLabel', parentOverrides: ['speakerSegmentId'] },
          subjects: { modelName: 'SubjectSpeakerSegment', parentOverrides: ['speakerSegmentId'] },
        },
      },
      highlights: {
        modelName: 'Highlight',
        parentOverrides: ['meetingId', 'cityId'],
        nestedEntities: {
          highlightedUtterances: { modelName: 'HighlightedUtterance', parentOverrides: ['highlightId'] },
        },
      },
      podcastSpecs: {
        modelName: 'PodcastSpec',
        parentOverrides: ['councilMeetingId', 'cityId'],
        nestedEntities: {
          parts: {
            modelName: 'PodcastPart',
            parentOverrides: ['podcastSpecId'],
            nestedEntities: {
              podcastPartAudioUtterances: { modelName: 'PodcastPartAudioUtterance', parentOverrides: ['podcastPartId'] },
            },
          },
        },
      },
    },
  },
}

interface ValidationResult {
  entityPath: string
  modelName: string
  instanceCount: number
  missingWithDefault: string[]
  missingProvidedByParent: string[]
  missingUnexpected: string[]
  extraRelation: string[]
  extraUnknown: string[]
}

/**
 * Collect all unique keys across all instances of an entity
 */
function collectKeys(items: Record<string, unknown>[]): Set<string> {
  const keys = new Set<string>()
  for (const item of items) {
    for (const key of Object.keys(item)) {
      keys.add(key)
    }
  }
  return keys
}

/**
 * Validate a single entity type against its Prisma model
 */
function validateEntity(
  items: Record<string, unknown>[],
  mapping: EntityMapping,
  entityPath: string,
  results: ValidationResult[]
): void {
  if (!items || items.length === 0) return

  const fieldInfo = getModelFieldInfo(mapping.modelName)
  const seedKeys = collectKeys(items)

  // Get DMMF model for checking hasDefaultValue
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === mapping.modelName)
  if (!model) return

  const parentOverrideSet = new Set(mapping.parentOverrides || [])

  const result: ValidationResult = {
    entityPath,
    modelName: mapping.modelName,
    instanceCount: items.length,
    missingWithDefault: [],
    missingProvidedByParent: [],
    missingUnexpected: [],
    extraRelation: [],
    extraUnknown: [],
  }

  // Check for scalar fields missing from seed data
  for (const fieldName of fieldInfo.scalarFields) {
    if (!seedKeys.has(fieldName)) {
      // FK fields injected from parent context at seed time — expected to be absent
      if (parentOverrideSet.has(fieldName)) {
        result.missingProvidedByParent.push(fieldName)
        continue
      }
      const field = model.fields.find(f => f.name === fieldName)
      const hasDefault = field?.hasDefaultValue || field?.isUpdatedAt
      if (hasDefault) {
        result.missingWithDefault.push(fieldName)
      } else {
        // Check if the field is nullable (optional) — not necessarily a problem
        const isOptional = !field?.isRequired
        if (isOptional) {
          result.missingWithDefault.push(`${fieldName} (nullable)`)
        } else {
          result.missingUnexpected.push(fieldName)
        }
      }
    }
  }

  // Check for extra keys in seed data
  for (const key of seedKeys) {
    if (fieldInfo.scalarFields.has(key)) continue
    if (fieldInfo.relationFields.has(key)) {
      result.extraRelation.push(key)
    } else if (fieldInfo.unsupportedFields.has(key)) {
      result.extraRelation.push(`${key} (unsupported)`)
    } else {
      // Check if it's a known nested entity key from our mappings
      if (mapping.nestedEntities && key in mapping.nestedEntities) {
        result.extraRelation.push(`${key} (nested)`)
      } else {
        result.extraUnknown.push(key)
      }
    }
  }

  results.push(result)

  // Recursively validate nested entities
  if (mapping.nestedEntities) {
    for (const [nestedKey, nestedMapping] of Object.entries(mapping.nestedEntities)) {
      const nestedItems = items.flatMap(
        item => (item[nestedKey] as Record<string, unknown>[]) || []
      )
      if (nestedItems.length > 0) {
        validateEntity(nestedItems, nestedMapping, `${entityPath}.${nestedKey}`, results)
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const seedPath = args.find(a => !a.startsWith('--'))

  if (!seedPath) {
    console.error('Usage: npx tsx scripts/validate-seed-schema.ts [--strict] <path-to-seed.json>')
    process.exit(1)
  }

  if (!fs.existsSync(seedPath)) {
    console.error(`Seed file not found: ${seedPath}`)
    process.exit(1)
  }

  console.log(`Validating seed data: ${seedPath}`)
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'))

  const results: ValidationResult[] = []

  for (const [key, mapping] of Object.entries(ENTITY_MAPPINGS)) {
    const items = seedData[key]
    if (items && Array.isArray(items)) {
      validateEntity(items, mapping, key, results)
    }
  }

  // Print results
  // Collect items that need seed data regeneration for the summary
  const needsUpdate: { entity: string; model: string; fields: string[] }[] = []
  const staleKeys: { entity: string; keys: string[] }[] = []

  for (const result of results) {
    const hasIssues = result.missingUnexpected.length > 0

    console.log(`\n--- ${result.entityPath} -> ${result.modelName} (${result.instanceCount} instances) ---`)

    if (result.missingProvidedByParent.length > 0) {
      console.log(`  Provided by parent: ${result.missingProvidedByParent.join(', ')}`)
    }
    if (result.missingWithDefault.length > 0) {
      console.log(`  Missing (has default/nullable): ${result.missingWithDefault.join(', ')}`)
    }
    if (result.missingUnexpected.length > 0) {
      console.log(`  NEEDS UPDATE - required fields missing from seed data: ${result.missingUnexpected.join(', ')}`)
      needsUpdate.push({
        entity: result.entityPath,
        model: result.modelName,
        fields: result.missingUnexpected,
      })
    }
    if (result.extraRelation.length > 0) {
      console.log(`  Extra (relation/nested): ${result.extraRelation.join(', ')}`)
    }
    if (result.extraUnknown.length > 0) {
      console.log(`  WARNING - extra (unknown): ${result.extraUnknown.join(', ')}`)
      staleKeys.push({ entity: result.entityPath, keys: result.extraUnknown })
    }

    const allClean = !hasIssues
      && result.missingWithDefault.length === 0
      && result.missingProvidedByParent.length === 0
      && result.extraRelation.length === 0
      && result.extraUnknown.length === 0
    if (allClean) {
      console.log(`  All fields match.`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))

  if (needsUpdate.length > 0) {
    console.log('SEED DATA UPDATE NEEDED after merging this PR:')
    for (const item of needsUpdate) {
      console.log(`  ${item.model}: ${item.fields.join(', ')}`)
    }
    console.log('\nTo update: run generate-seed against a DB with the new migration applied,')
    console.log('then push the updated JSON to the opencouncil-seed-data repo.')
  } else {
    console.log('VALIDATION PASSED: Seed data is in sync with the schema.')
  }

  if (staleKeys.length > 0) {
    console.log('\nStale keys in seed data (harmless, ignored by seed script):')
    for (const item of staleKeys) {
      console.log(`  ${item.entity}: ${item.keys.join(', ')}`)
    }
  }

  // Write GitHub Actions job summary if running in CI
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const lines: string[] = []
    if (needsUpdate.length > 0) {
      lines.push('## Seed Data Update Needed')
      lines.push('')
      lines.push('This PR introduces schema changes that require regenerating the seed data after merging.')
      lines.push('')
      lines.push('| Model | Missing Fields |')
      lines.push('|-------|---------------|')
      for (const item of needsUpdate) {
        lines.push(`| \`${item.model}\` | ${item.fields.map(f => '`' + f + '`').join(', ')} |`)
      }
      lines.push('')
      lines.push('**After merging:**')
      lines.push('1. Run the migration on staging')
      lines.push('2. Regenerate: `npm run generate-seed -- -s <staging-db-url>`')
      lines.push('3. Push updated JSON to `opencouncil-seed-data` repo')
    } else {
      lines.push('## Seed Validation Passed')
      lines.push('')
      lines.push('Seed data is in sync with the schema.')
    }
    if (staleKeys.length > 0) {
      lines.push('')
      lines.push('<details><summary>Stale keys in seed data (harmless)</summary>')
      lines.push('')
      for (const item of staleKeys) {
        lines.push(`- \`${item.entity}\`: ${item.keys.map(k => '`' + k + '`').join(', ')}`)
      }
      lines.push('</details>')
    }
    fs.appendFileSync(summaryPath, lines.join('\n') + '\n')
  }

  // In strict mode, fail on unexpected mismatches (for local post-dump validation)
  if (strict && needsUpdate.length > 0) {
    process.exit(1)
  }
}

main()
