import fs from 'fs';
import path from 'path';
import proj4 from 'proj4';

// Define the source and destination coordinate systems.
// GGRS87 / Greek Grid
const sourceProjection = '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=-199.87,74.79,246.62,0,0,0,0 +units=m +no_defs';
// WGS84 - Standard for GeoJSON
const destProjection = 'WGS84';

// Regular expressions for different coordinate patterns
// Pattern 1: textualDefinition - "X: <number>, Y: <number>" (GGRS87 coordinates)
const textualDefCoordRegex = /X:\s*([\d.]*),\s*Y:\s*([\d.]*)/;
// Pattern 2: description - "Συντεταγμένες από πηγή (X: <number>, Y: <number>)" (WGS84 coordinates)
const descriptionCoordRegex = /Συντεταγμένες από πηγή \(X:\s*([\d.]+),\s*Y:\s*([\d.]+)\)/;

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

interface Geometry {
  type: 'point' | 'circle' | 'polygon' | 'derived';
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

interface Regulation {
  regulation: (GeoSet | { type: 'chapter' })[];
}

function transformCoordinates(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  const regulationData: Regulation = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  let transformedFromTextualDef = 0;
  let transformedFromDescription = 0;

  regulationData.regulation.forEach(item => {
    if (item.type === 'geoset') {
      item.geometries.forEach(geometry => {
        if (geometry.type === 'point' && !geometry.geojson) {
          // Try pattern 1: textualDefinition with GGRS87 coordinates
          if (geometry.textualDefinition) {
            const match = geometry.textualDefinition.match(textualDefCoordRegex);
            if (match && match[1] && match[2]) {
              const x = parseFloat(match[1]);
              const y = parseFloat(match[2]);

              if (!isNaN(x) && !isNaN(y)) {
                // Transform from GGRS87 to WGS84
                const [longitude, latitude] = proj4(sourceProjection, destProjection, [x, y]);
                geometry.geojson = {
                  type: 'Point',
                  coordinates: [longitude, latitude],
                };
                transformedFromTextualDef++;
                console.log(`Transformed GGRS87 coordinates for geometry: ${geometry.id} (${x}, ${y}) -> (${longitude.toFixed(6)}, ${latitude.toFixed(6)})`);
                return; // Skip checking description if we found coordinates in textualDefinition
              }
            }
          }

          // Try pattern 2: description with WGS84 coordinates
          if (geometry.description) {
            const match = geometry.description.match(descriptionCoordRegex);
            if (match && match[1] && match[2]) {
              const x = parseFloat(match[1]);
              const y = parseFloat(match[2]);

              if (!isNaN(x) && !isNaN(y)) {
                // These are already in WGS84 format (longitude, latitude)
                geometry.geojson = {
                  type: 'Point',
                  coordinates: [x, y],
                };
                transformedFromDescription++;
                console.log(`Used WGS84 coordinates for geometry: ${geometry.id} (${x}, ${y})`);
                return;
              }
            }
          }

          // If we get here, no coordinates were found
          console.warn(`WARN: Could not parse coordinates for geometry: ${geometry.id}`);
        }
      });
    }
  });

  fs.writeFileSync(absolutePath, JSON.stringify(regulationData, null, 2));
  console.log(`\nTransformation complete:`);
  console.log(`- Transformed from textualDefinition (GGRS87): ${transformedFromTextualDef} geometries`);
  console.log(`- Used from description (WGS84): ${transformedFromDescription} geometries`);
  console.log(`- Total processed: ${transformedFromTextualDef + transformedFromDescription} geometries`);
  console.log(`Updated file saved to: ${absolutePath}`);
}

// --- Script execution ---
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: tsx scripts/transform-regulation-coordinates.ts <path_to_regulation.json>');
  process.exit(1);
}

const regulationFilePath = args[0];
transformCoordinates(regulationFilePath); 