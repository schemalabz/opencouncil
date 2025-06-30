import fs from 'fs';
import path from 'path';
import proj4 from 'proj4';

// Define the source and destination coordinate systems.
// GGRS87 / Greek Grid
const sourceProjection = '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=-199.87,74.79,246.62,0,0,0,0 +units=m +no_defs';
// WGS84 - Standard for GeoJSON
const destProjection = 'WGS84';

// Regular expression to extract X and Y coordinates from the textualDefinition string.
// It looks for "X: <number>" and "Y: <number>"
const coordRegex = /X:\s*([\d.]*),\s*Y:\s*([\d.]*)/;

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

interface Geometry {
  type: 'point' | 'circle' | 'polygon' | 'derived';
  name: string;
  id: string;
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
  let transformedCount = 0;

  regulationData.regulation.forEach(item => {
    if (item.type === 'geoset') {
      item.geometries.forEach(geometry => {
        if (geometry.type === 'point' && !geometry.geojson && geometry.textualDefinition) {
          const match = geometry.textualDefinition.match(coordRegex);

          if (match && match[1] && match[2]) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);

            if (!isNaN(x) && !isNaN(y)) {
              const [longitude, latitude] = proj4(sourceProjection, destProjection, [x, y]);
              geometry.geojson = {
                type: 'Point',
                coordinates: [longitude, latitude],
              };
              transformedCount++;
              console.log(`Transformed coordinates for geometry: ${geometry.id}`);
            }
          } else {
             console.warn(`WARN: Could not parse coordinates for geometry: ${geometry.id}`);
          }
        }
      });
    }
  });

  fs.writeFileSync(absolutePath, JSON.stringify(regulationData, null, 2));
  console.log(`\nTransformation complete. Transformed ${transformedCount} geometries.`);
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