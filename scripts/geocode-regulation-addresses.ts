#!/usr/bin/env tsx

/**
 * Geocode addresses in a regulation JSON file using Google Geocoding API.
 *
 * Finds all point geometries with a textualDefinition but no geojson coordinates,
 * geocodes each address scoped to Athens, and fills in the geojson field.
 *
 * Usage:
 *   npx tsx scripts/geocode-regulation-addresses.ts <path_to_regulation.json>
 *
 * Options:
 *   --dry-run    Preview what would be geocoded without making API calls
 *   --force      Re-geocode even if geojson already exists
 *   --delay=N    Delay between API calls in ms (default: 200)
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Athens center coordinates for biasing geocoding results
const ATHENS_CENTER = { lat: 37.9838, lng: 23.7275 };
// Bounding box for Athens municipality (SW corner, NE corner)
const ATHENS_BOUNDS = {
  south: 37.94,
  west: 23.68,
  north: 38.02,
  east: 23.79,
};

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

interface Geometry {
  type: string;
  name: string;
  id: string;
  description?: string;
  textualDefinition?: string;
  geojson: GeoJSONPoint | null;
}

interface GeoSet {
  type: 'geoset';
  id: string;
  name: string;
  geometries: Geometry[];
}

interface RegulationData {
  regulation: Array<GeoSet | { type: string }>;
  [key: string]: unknown;
}

interface GeocodingResult {
  geometryId: string;
  address: string;
  status: 'success' | 'zero_results' | 'error';
  coordinates?: [number, number];
  formattedAddress?: string;
  error?: string;
}

async function geocodeAddress(
  address: string,
  geosetName: string,
): Promise<{
  coordinates: [number, number];
  formattedAddress: string;
} | null> {
  // Build a search query scoped to Athens
  // Append "Αθήνα" (Athens) to help the geocoder scope results
  const query = `${address}, ${geosetName}, Αθήνα, Ελλάδα`;

  const response = await axios.get(
    'https://maps.googleapis.com/maps/api/geocode/json',
    {
      params: {
        address: query,
        key: GOOGLE_API_KEY,
        language: 'el',
        region: 'gr',
        // Bias results toward Athens
        bounds: `${ATHENS_BOUNDS.south},${ATHENS_BOUNDS.west}|${ATHENS_BOUNDS.north},${ATHENS_BOUNDS.east}`,
      },
      timeout: 10000,
    },
  );

  if (response.data.status === 'ZERO_RESULTS') {
    return null;
  }

  if (response.data.status !== 'OK') {
    throw new Error(
      `Google Geocoding API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`,
    );
  }

  const result = response.data.results[0];
  if (!result?.geometry?.location) {
    return null;
  }

  const { lat, lng } = result.geometry.location;

  // Verify the result is within Athens bounds (with some margin)
  const margin = 0.02; // ~2km margin
  if (
    lat < ATHENS_BOUNDS.south - margin ||
    lat > ATHENS_BOUNDS.north + margin ||
    lng < ATHENS_BOUNDS.west - margin ||
    lng > ATHENS_BOUNDS.east + margin
  ) {
    console.warn(
      `  ⚠ Result outside Athens bounds: ${result.formatted_address} (${lat}, ${lng})`,
    );
    return null;
  }

  return {
    coordinates: [lng, lat], // GeoJSON uses [lng, lat]
    formattedAddress: result.formatted_address,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeRegulation(
  filePath: string,
  options: { dryRun: boolean; force: boolean; delayMs: number },
): Promise<void> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  const regulationData: RegulationData = JSON.parse(
    fs.readFileSync(absolutePath, 'utf-8'),
  );

  // Collect all geometries that need geocoding
  const toGeocode: Array<{
    geometry: Geometry;
    geosetName: string;
    geosetId: string;
  }> = [];

  for (const item of regulationData.regulation) {
    if (item.type !== 'geoset') continue;
    const geoset = item as GeoSet;

    for (const geometry of geoset.geometries) {
      if (geometry.type !== 'point') continue;

      // Skip if already has coordinates (unless --force)
      if (geometry.geojson && !options.force) continue;

      // Need either textualDefinition or name to geocode
      const address = geometry.textualDefinition || geometry.name;
      if (!address) continue;

      toGeocode.push({
        geometry,
        geosetName: geoset.name,
        geosetId: geoset.id,
      });
    }
  }

  console.log(`\nFound ${toGeocode.length} geometries to geocode.\n`);

  if (toGeocode.length === 0) {
    console.log('Nothing to geocode. All point geometries already have coordinates.');
    return;
  }

  if (options.dryRun) {
    console.log('DRY RUN - Would geocode these addresses:\n');
    for (const { geometry, geosetName } of toGeocode) {
      const address = geometry.textualDefinition || geometry.name;
      console.log(`  [${geosetName}] ${geometry.id}: ${address}`);
    }
    return;
  }

  // Geocode each address
  const results: GeocodingResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toGeocode.length; i++) {
    const { geometry, geosetName } = toGeocode[i];
    const address = geometry.textualDefinition || geometry.name;

    process.stdout.write(
      `[${i + 1}/${toGeocode.length}] ${geosetName} > ${address}...`,
    );

    try {
      const result = await geocodeAddress(address, geosetName);

      if (result) {
        geometry.geojson = {
          type: 'Point',
          coordinates: result.coordinates,
        };
        successCount++;
        console.log(` ✓ ${result.formattedAddress}`);
        results.push({
          geometryId: geometry.id,
          address,
          status: 'success',
          coordinates: result.coordinates,
          formattedAddress: result.formattedAddress,
        });
      } else {
        failCount++;
        console.log(' ✗ ZERO_RESULTS');
        results.push({
          geometryId: geometry.id,
          address,
          status: 'zero_results',
        });
      }
    } catch (error) {
      failCount++;
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';
      console.log(` ✗ ERROR: ${errorMsg}`);
      results.push({
        geometryId: geometry.id,
        address,
        status: 'error',
        error: errorMsg,
      });
    }

    // Rate limiting
    if (i < toGeocode.length - 1) {
      await delay(options.delayMs);
    }
  }

  // Save updated regulation JSON
  fs.writeFileSync(absolutePath, JSON.stringify(regulationData, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('GEOCODING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total:   ${toGeocode.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed:  ${failCount}`);
  console.log(`Updated file: ${absolutePath}`);

  // List failures for manual review
  const failures = results.filter((r) => r.status !== 'success');
  if (failures.length > 0) {
    console.log(`\nFailed addresses (${failures.length}) — use admin geo-editor to fix:`);
    for (const f of failures) {
      console.log(`  - ${f.geometryId}: ${f.address} (${f.status}${f.error ? ': ' + f.error : ''})`);
    }

    // Save failures report
    const reportPath = absolutePath.replace('.json', '-geocode-failures.json');
    fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2));
    console.log(`\nFailure report saved to: ${reportPath}`);
  }
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));

  if (positional.length !== 1) {
    console.log(
      'Usage: npx tsx scripts/geocode-regulation-addresses.ts [options] <path_to_regulation.json>',
    );
    console.log('\nOptions:');
    console.log('  --dry-run    Preview what would be geocoded without making API calls');
    console.log('  --force      Re-geocode even if geojson already exists');
    console.log('  --delay=N    Delay between API calls in ms (default: 200)');
    process.exit(1);
  }

  if (!GOOGLE_API_KEY) {
    console.error('Error: GOOGLE_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it in your shell.');
    process.exit(1);
  }

  const dryRun = flags.includes('--dry-run');
  const force = flags.includes('--force');
  const delayFlag = flags.find((f) => f.startsWith('--delay='));
  const delayMs = delayFlag ? parseInt(delayFlag.split('=')[1], 10) : 200;

  geocodeRegulation(positional[0], { dryRun, force, delayMs })
    .then(() => {
      console.log('\nDone.');
    })
    .catch((error) => {
      console.error('\nFatal error:', error);
      process.exit(1);
    });
}

main();
