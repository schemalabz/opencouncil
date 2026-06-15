import { Prisma } from '@prisma/client'

/**
 * Field metadata for a Prisma model, derived from DMMF.
 */
interface ModelFieldInfo {
  /** Scalar and enum fields (can be passed to createMany) */
  scalarFields: Set<string>
  /** Relation fields (object references, stripped during extraction) */
  relationFields: Set<string>
  /** Unsupported fields like PostGIS geometry (stripped during extraction) */
  unsupportedFields: Set<string>
}

// Cache model field info to avoid repeated DMMF lookups
const fieldInfoCache = new Map<string, ModelFieldInfo>()

/**
 * Get categorized field info for a Prisma model using DMMF metadata.
 *
 * Uses Prisma.dmmf.datamodel.models to determine which fields are scalars/enums
 * (safe for createMany), which are relations (object references to strip), and
 * which are unsupported (e.g., PostGIS geometry).
 */
export function getModelFieldInfo(modelName: string): ModelFieldInfo {
  const cached = fieldInfoCache.get(modelName)
  if (cached) return cached

  const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)
  if (!model) {
    throw new Error(`Model "${modelName}" not found in Prisma DMMF. Check the model name matches schema.prisma exactly.`)
  }

  const info: ModelFieldInfo = {
    scalarFields: new Set(),
    relationFields: new Set(),
    unsupportedFields: new Set(),
  }

  for (const field of model.fields) {
    if (field.kind === 'scalar' || field.kind === 'enum') {
      info.scalarFields.add(field.name)
    } else if (field.kind === 'object') {
      info.relationFields.add(field.name)
    } else if (field.kind === 'unsupported') {
      info.unsupportedFields.add(field.name)
    }
  }

  fieldInfoCache.set(modelName, info)
  return info
}

/**
 * Extract only scalar/enum fields from a seed data object, using DMMF to
 * automatically determine which fields are safe for Prisma createMany.
 *
 * This replaces manual `.map()` calls that cherry-pick fields, ensuring new
 * schema fields are automatically passed through without code changes.
 *
 * @param data - Raw seed JSON object (may contain relation objects, extra keys)
 * @param modelName - Prisma model name (must match schema.prisma exactly)
 * @param overrides - Optional field overrides (e.g., FK fields set from parent context)
 * @returns Object containing only scalar/enum fields from the model
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractScalarFields(
  data: Record<string, any>,
  modelName: string,
  overrides?: Record<string, any>
): any {
  const { scalarFields } = getModelFieldInfo(modelName)

  const result: Record<string, any> = {}

  for (const fieldName of scalarFields) {
    // Overrides take precedence over data values
    if (overrides && fieldName in overrides) {
      result[fieldName] = overrides[fieldName]
    } else if (fieldName in data) {
      result[fieldName] = data[fieldName]
    }
    // If field is not in data or overrides, omit it — Prisma will use the
    // schema default (e.g., @default(now()), @default(cuid()), @updatedAt)
  }

  return result
}
