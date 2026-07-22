/**
 * Import offers from a CSV export into the local dev database.
 *
 * Usage:
 *   npx tsx scripts/import_offers.ts ~/Downloads/offers.csv
 *
 * The CSV must have headers matching the Offer model fields exactly
 * (as exported from Prisma Studio or a `\copy` command).
 *
 * On each run the script:
 *   1. Deletes all existing offers
 *   2. Creates stub City records for any cityId not already in the DB
 *   3. Ensures all cities referenced by offers are non-pending (set to "unlisted")
 *   4. Imports all offers from the CSV
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  parseCsvFile,
  toBool,
  toDate,
  toFloat,
  toFloatOrNull,
  toIntOrNull,
  toStringOrNull,
} from "./lib/csv";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import_offers.ts <path-to-csv>");
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const rows = await parseCsvFile(resolved);
  console.log(`Parsed ${rows.length} offers from CSV`);

  // Step 1: Delete all existing offers
  const deleted = await prisma.offer.deleteMany();
  console.log(`Deleted ${deleted.count} existing offers`);

  // Step 2: Ensure cities exist for all cityIds in the CSV
  // Build a map from cityId → recipientName (used as fallback display name)
  const cityNameMap = new Map<string, string>();
  for (const row of rows) {
    const cityId = toStringOrNull(row.cityId);
    if (cityId && !cityNameMap.has(cityId)) {
      // Strip "Δήμο " prefix to get the city name for the stub
      const recipient = row.recipientName;
      const cityName = recipient
        .replace(/^Δήμο\s+/, "")
        .replace(/^Περιφέρεια\s+/, "");
      cityNameMap.set(cityId, cityName);
    }
  }

  const allCityIds = [...cityNameMap.keys()];
  const existingCities = await prisma.city.findMany({
    where: { id: { in: allCityIds } },
    select: { id: true },
  });
  const existingCityIds = new Set(existingCities.map((c) => c.id));
  const missingCityIds = allCityIds.filter((id) => !existingCityIds.has(id));

  if (missingCityIds.length > 0) {
    console.log(`\nCreating ${missingCityIds.length} stub cities...`);
    for (const cityId of missingCityIds) {
      const name = cityNameMap.get(cityId) || cityId;
      await prisma.city.create({
        data: {
          id: cityId,
          name,
          name_en: cityId.replace(/[-_]/g, " "),
          name_municipality: `Δήμος ${name}`,
          name_municipality_en: `Municipality of ${cityId.replace(/[-_]/g, " ")}`,
          timezone: "Europe/Athens",
          status: "unlisted",
        },
      });
      console.log(`  Created stub city: ${cityId} (${name})`);
    }
  }

  // Step 3: Ensure all referenced cities are non-pending
  const pendingCities = await prisma.city.findMany({
    where: { id: { in: allCityIds }, status: "pending" },
    select: { id: true },
  });
  if (pendingCities.length > 0) {
    await prisma.city.updateMany({
      where: { id: { in: pendingCities.map((c) => c.id) } },
      data: { status: "unlisted" },
    });
    console.log(
      `Promoted ${pendingCities.length} pending cities to unlisted: ${pendingCities.map((c) => c.id).join(", ")}`
    );
  }

  // Step 4: Import all offers
  let created = 0;
  let errors = 0;

  for (const row of rows) {
    const id = row.id;
    try {
      const cityId = toStringOrNull(row.cityId);

      await prisma.offer.create({
        data: {
          id,
          createdAt: toDate(row.createdAt),
          // Preserve the prod timestamp — otherwise @updatedAt stamps "now"
          // and every seeded offer looks recently touched.
          updatedAt: toDate(row.updatedAt),
          type: row.type || "pilot",
          version: toIntOrNull(row.version),
          startDate: toDate(row.startDate),
          endDate: toDate(row.endDate),
          recipientName: row.recipientName,
          platformPrice: toFloat(row.platformPrice),
          ingestionPerHourPrice: toFloat(row.ingestionPerHourPrice),
          hoursToIngest: parseInt(row.hoursToIngest, 10),
          discountPercentage: toFloat(row.discountPercentage),
          meetingsToIngest: toIntOrNull(row.meetingsToIngest),
          hoursToGuarantee: toIntOrNull(row.hoursToGuarantee),
          cityId,
          correctnessGuarantee: toBool(row.correctnessGuarantee),
          equipmentRentalPrice: toFloatOrNull(row.equipmentRentalPrice),
          equipmentRentalName: toStringOrNull(row.equipmentRentalName),
          equipmentRentalDescription: toStringOrNull(
            row.equipmentRentalDescription
          ),
          physicalPresenceHours: toIntOrNull(row.physicalPresenceHours),
          respondToEmail: row.respondToEmail,
          respondToPhone: row.respondToPhone,
          respondToName: row.respondToName,
          // Lifecycle columns — absent in pre-migration exports, in which
          // case they default to unsigned.
          agreed: row.agreed !== undefined ? toBool(row.agreed) : false,
          adam: row.adam !== undefined ? toStringOrNull(row.adam) : null,
        },
      });
      created++;
    } catch (err) {
      errors++;
      console.error(`Error importing offer ${id}:`, err);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created}`);
  if (errors > 0) console.log(`  Errors:  ${errors}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
