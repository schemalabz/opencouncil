#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import Anthropic from '@anthropic-ai/sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface RegulationData {
    title: string;
    contactEmail: string;
    sources: Array<{
        title: string;
        url: string;
        description?: string;
    }>;
    referenceFormat?: {
        pattern: string;
        syntax: string;
    };
    regulation: Array<any>;
}

class RegulationConverter {
    private schema: any;
    private ajv: Ajv;

    constructor() {
        // Load and setup JSON schema validation
        const schemaPath = path.join(process.cwd(), 'regulation.schema.json');
        this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

        this.ajv = new Ajv({
            allErrors: true,
            strict: false,
        });
        addFormats(this.ajv);
    }

    async convertPdfToJson(pdfPath: string, outputPath: string): Promise<void> {
        try {
            console.log('📄 Reading PDF file...');
            const pdfBuffer = fs.readFileSync(pdfPath);
            const pdfData = await pdfParse(pdfBuffer);

            console.log(`📊 PDF parsed successfully. Total pages: ${pdfData.numpages}`);
            console.log(`📝 Total text length: ${pdfData.text.length} characters`);

            // Split text into manageable chunks
            const chunks = this.splitTextIntoChunks(pdfData.text, 6000); // ~6k chars per chunk
            console.log(`📦 Split into ${chunks.length} chunks for processing`);

            // Process each chunk to extract structured data
            const processedChunks = [];
            for (let i = 0; i < chunks.length; i++) {
                console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}...`);
                const chunkResult = await this.processChunk(chunks[i], i, chunks.length);
                processedChunks.push(chunkResult);

                // Add delay to respect rate limits
                if (i < chunks.length - 1) {
                    await this.delay(2000);
                }
            }

            // Consolidate all chunks into final regulation structure
            console.log('🔗 Consolidating chunks into final structure...');
            const regulation = await this.consolidateChunks(processedChunks, pdfData.text);

            // Validate against schema
            console.log('✅ Validating against JSON schema...');
            const isValid = this.validateAgainstSchema(regulation);

            if (!isValid) {
                console.error('❌ Schema validation failed:');
                console.error('Validation errors:', JSON.stringify(this.ajv.errors, null, 2));
                console.error('Generated regulation structure:', JSON.stringify(regulation, null, 2).substring(0, 1000) + '...');

                // Save the invalid JSON for debugging
                const debugPath = outputPath.replace('.json', '-debug.json');
                fs.writeFileSync(debugPath, JSON.stringify(regulation, null, 2));
                console.log(`🐛 Debug JSON saved to ${debugPath}`);

                throw new Error('Generated JSON does not conform to schema');
            }

            // Save to output file
            fs.writeFileSync(outputPath, JSON.stringify(regulation, null, 2));
            console.log(`💾 Successfully saved regulation to ${outputPath}`);

        } catch (error) {
            console.error('❌ Error converting PDF:', error);
            throw error;
        }
    }

    private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
        const chunks: string[] = [];
        const paragraphs = text.split('\n\n');

        let currentChunk = '';

        for (const paragraph of paragraphs) {
            if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = paragraph;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    private async processChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<any> {
        const prompt = `You are converting a legal regulation document into structured JSON format. 

This is chunk ${chunkIndex + 1} of ${totalChunks} from a regulation document.

IMPORTANT CONTEXT:
- The regulation follows a hierarchical structure: Chapters → Articles
- Geographic locations should be identified and grouped into logical GeoSets (e.g., "prohibited_areas", "parking_zones", "speed_limit_areas")
- Each GeoSet contains multiple related geometries (points, circles, polygons)
- Use {REF:id} syntax for cross-references between sections and geosets
- Generate consistent IDs using lowercase English with underscores (e.g., "general_provisions", "parking_rules")

CHUNK TEXT:
${chunk}

Please analyze this chunk and extract:
1. Any chapter headers with their numbers and titles
2. Article numbers, titles, and content
3. Geographic locations mentioned (addresses, area names, coordinates if any) - group these logically
4. Cross-references that should use {REF:id} syntax to link to chapters, articles, or geosets
5. Key regulatory elements (prohibitions, requirements, penalties, etc.)

Return a simple JSON object with this structure:
{
  "chapters": [
    {
      "num": 1,
      "id": "chapter_id",
      "title": "Chapter Title",
      "summary": "Brief summary",
      "articles": [
        {
          "num": 1,
          "id": "article_id", 
          "title": "Article Title",
          "summary": "Brief summary",
          "body": "Article text"
        }
      ]
    }
  ],
  "locations": [
    {
      "id": "location_id",
      "name": "Location Name",
      "type": "point", 
      "description": "Address or description"
    }
  ]
}

If this chunk doesn't contain complete chapters/articles, extract whatever structural elements you can identify.`;

        const response = await anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 8000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                },
                {
                    role: 'assistant',
                    content: '{'
                }
            ]
        });

        try {
            const content = response.content[0];
            if (content.type === 'text') {
                console.log(`🔍 Raw response for chunk ${chunkIndex + 1}:`, content.text.substring(0, 500) + '...');

                // Since we prefilled with '{', we need to prepend it to the response
                const jsonString = '{' + content.text;

                console.log(`✅ Attempting to parse prefilled JSON for chunk ${chunkIndex + 1}...`);

                try {
                    const parsed = JSON.parse(jsonString);
                    console.log(`✅ Successfully parsed chunk ${chunkIndex + 1}:`, {
                        chapters: parsed.chapters?.length || 0,
                        locations: parsed.locations?.length || 0
                    });
                    return parsed;
                } catch (parseError) {
                    console.error(`❌ JSON parse error for chunk ${chunkIndex + 1}:`, parseError);
                    console.error('JSON string (first 500 chars):', jsonString.substring(0, 500));

                    // Try to fix common JSON issues
                    let fixedJson = jsonString;

                    console.log('🔧 Attempting to fix truncated JSON...');

                    // Handle unterminated strings - find the last complete string
                    let lastValidPosition = -1;
                    let inString = false;
                    let escaped = false;
                    let braceDepth = 0;
                    let bracketDepth = 0;

                    for (let i = 0; i < fixedJson.length; i++) {
                        const char = fixedJson[i];

                        if (escaped) {
                            escaped = false;
                            continue;
                        }

                        if (char === '\\') {
                            escaped = true;
                            continue;
                        }

                        if (char === '"') {
                            inString = !inString;
                            if (!inString) {
                                // Just closed a string, this is a potentially valid position
                                lastValidPosition = i;
                            }
                            continue;
                        }

                        if (!inString) {
                            if (char === '{') braceDepth++;
                            else if (char === '}') braceDepth--;
                            else if (char === '[') bracketDepth++;
                            else if (char === ']') bracketDepth--;

                            if (char === ',' || char === '}' || char === ']') {
                                lastValidPosition = i;
                            }
                        }
                    }

                    // If we're in the middle of a string, truncate to last valid position
                    if (inString && lastValidPosition > -1) {
                        console.log(`🔧 Truncating at position ${lastValidPosition} to fix unterminated string`);
                        fixedJson = fixedJson.substring(0, lastValidPosition);
                    }

                    // Remove any trailing commas before closing braces/brackets
                    fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');

                    // Ensure proper closing of all open structures
                    braceDepth = 0;
                    bracketDepth = 0;
                    inString = false;
                    escaped = false;

                    for (let i = 0; i < fixedJson.length; i++) {
                        const char = fixedJson[i];
                        if (escaped) {
                            escaped = false;
                            continue;
                        }
                        if (char === '\\') {
                            escaped = true;
                            continue;
                        }
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        if (!inString) {
                            if (char === '{') braceDepth++;
                            else if (char === '}') braceDepth--;
                            else if (char === '[') bracketDepth++;
                            else if (char === ']') bracketDepth--;
                        }
                    }

                    // Close any unclosed structures
                    while (bracketDepth > 0) {
                        fixedJson += ']';
                        bracketDepth--;
                    }
                    while (braceDepth > 0) {
                        fixedJson += '}';
                        braceDepth--;
                    }

                    try {
                        const parsed = JSON.parse(fixedJson);
                        console.log(`✅ Successfully parsed fixed JSON for chunk ${chunkIndex + 1}:`, {
                            chapters: parsed.chapters?.length || 0,
                            locations: parsed.locations?.length || 0
                        });
                        return parsed;
                    } catch (fixError) {
                        console.error('❌ Could not fix JSON either:', fixError);
                    }
                }
            } else {
                console.error(`❌ Unexpected content type for chunk ${chunkIndex + 1}:`, content.type);
            }
            throw new Error('No valid JSON found in response');
        } catch (error) {
            console.error(`❌ Failed to parse chunk ${chunkIndex + 1}:`, error);
            if (error instanceof SyntaxError) {
                console.error('JSON parsing error - invalid JSON syntax');
            }
            console.warn(`⚠️  Using fallback structure for chunk ${chunkIndex + 1}`);
            return { chapters: [], locations: [] };
        }
    }

    private async consolidateChunks(processedChunks: any[], fullText: string): Promise<RegulationData> {
        console.log('🧠 Using Claude to consolidate and structure final regulation...');

        // Combine all extracted data
        const allChapters = processedChunks.flatMap(chunk => chunk.chapters || []);
        const allLocations = processedChunks.flatMap(chunk => chunk.locations || []);

        const consolidationPrompt = `You are finalizing a legal regulation conversion to JSON format that follows this EXACT schema structure:

{
  "title": "Regulation Title",
  "contactEmail": "municipality@example.com", 
  "sources": [{"title": "Original PDF", "url": "https://www.cityofathens.gr/regulations/epho-parking"}],
  "referenceFormat": {
    "pattern": "{REF:([a-zA-Z][a-zA-Z0-9_-]*)}",
    "syntax": "{REF:id}"
  },
  "regulation": [
    {
      "type": "chapter",
      "num": 1,
      "id": "chapter_id",
      "title": "Chapter Title",
      "summary": "Brief summary",
      "preludeBody": "Optional intro text with {REF:geoset_id} references",
      "articles": [
        {
          "num": 1,
          "id": "article_id",
          "title": "Article Title", 
          "summary": "Brief summary",
          "body": "Article text with {REF:geoset_id} or {REF:geometry_id} references"
        }
      ]
    },
    {
      "type": "geoset",
      "id": "prohibited_areas",
      "name": "Prohibited Areas",
      "description": "Areas where activity is prohibited",
      "geometries": [
        {
          "type": "polygon",
          "name": "Acropolis Area",
          "id": "acropolis_area", 
          "description": "Archaeological site of Acropolis",
          "geojson": {
            "type": "Polygon",
            "coordinates": [[[23.7258, 37.9715], [23.7278, 37.9715], [23.7278, 37.9735], [23.7258, 37.9735], [23.7258, 37.9715]]]
          }
        }
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
1. The "regulation" array MUST contain both chapter objects AND geoset objects
2. Chapter "num" and Article "num" fields must be integers (1, 2, 3), not strings or decimals
3. Geometry "type" can only be "point" or "polygon" (no "circle" - use polygon instead)
4. Each geometry needs: type, name, id, geojson. Description is optional
5. Use Athens coordinates: longitude ~23.72, latitude ~37.97 for points; polygon coordinates as arrays
6. Group locations logically: "prohibited_areas", "parking_zones", "speed_limit_areas", etc.
7. Articles should reference geosets/geometries using {REF:id} syntax

EXTRACTED DATA:
Chapters: ${JSON.stringify(allChapters, null, 2)}
Locations: ${JSON.stringify(allLocations, null, 2)}

FIRST 2000 CHARS OF DOCUMENT:
${fullText.substring(0, 2000)}

Tasks:
1. Extract the regulation title from the document
2. Organize chapters in logical order with proper numbering
3. Merge any duplicate or overlapping chapters/articles
4. Create geosets from the locations, grouping them logically
5. For each location, create a geometry object with placeholder Athens coordinates
6. Add cross-references using {REF:id} syntax where articles reference geographic areas
7. Ensure all IDs use consistent naming (lowercase, underscores)
8. Provide a realistic municipality contact email

Return the complete regulation JSON that validates against the schema.`;

        const response = await anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 12000,
            messages: [
                {
                    role: 'user',
                    content: consolidationPrompt
                },
                {
                    role: 'assistant',
                    content: '{'
                }
            ]
        });

        const content = response.content[0];
        if (content.type === 'text') {
            console.log('🔍 Consolidation response preview:', content.text.substring(0, 500) + '...');

            // Since we prefilled with '{', we need to prepend it to the response
            const jsonString = '{' + content.text;

            try {
                console.log('✅ Attempting to parse prefilled consolidation JSON...');
                const parsed = JSON.parse(jsonString);
                console.log('✅ Successfully parsed consolidated regulation');
                return parsed;
            } catch (error) {
                console.error('❌ Failed to parse consolidated JSON:', error);
                console.error('JSON string (first 1000 chars):', jsonString.substring(0, 1000) + '...');

                // Try to fix common JSON issues
                let fixedJson = jsonString;

                console.log('🔧 Attempting to fix truncated consolidation JSON...');

                // Handle unterminated strings - find the last complete string
                let lastValidPosition = -1;
                let inString = false;
                let escaped = false;
                let braceDepth = 0;
                let bracketDepth = 0;

                for (let i = 0; i < fixedJson.length; i++) {
                    const char = fixedJson[i];

                    if (escaped) {
                        escaped = false;
                        continue;
                    }

                    if (char === '\\') {
                        escaped = true;
                        continue;
                    }

                    if (char === '"') {
                        inString = !inString;
                        if (!inString) {
                            // Just closed a string, this is a potentially valid position
                            lastValidPosition = i;
                        }
                        continue;
                    }

                    if (!inString) {
                        if (char === '{') braceDepth++;
                        else if (char === '}') braceDepth--;
                        else if (char === '[') bracketDepth++;
                        else if (char === ']') bracketDepth--;

                        if (char === ',' || char === '}' || char === ']') {
                            lastValidPosition = i;
                        }
                    }
                }

                // If we're in the middle of a string, truncate to last valid position
                if (inString && lastValidPosition > -1) {
                    console.log(`🔧 Truncating consolidation at position ${lastValidPosition} to fix unterminated string`);
                    fixedJson = fixedJson.substring(0, lastValidPosition);
                }

                // Remove any trailing commas before closing braces/brackets
                fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');

                // Ensure proper closing of all open structures
                braceDepth = 0;
                bracketDepth = 0;
                inString = false;
                escaped = false;

                for (let i = 0; i < fixedJson.length; i++) {
                    const char = fixedJson[i];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (char === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    if (!inString) {
                        if (char === '{') braceDepth++;
                        else if (char === '}') braceDepth--;
                        else if (char === '[') bracketDepth++;
                        else if (char === ']') bracketDepth--;
                    }
                }

                // Close any unclosed structures
                while (bracketDepth > 0) {
                    fixedJson += ']';
                    bracketDepth--;
                }
                while (braceDepth > 0) {
                    fixedJson += '}';
                    braceDepth--;
                }

                try {
                    const parsed = JSON.parse(fixedJson);
                    console.log('✅ Successfully parsed fixed consolidation JSON');
                    return parsed;
                } catch (fixError) {
                    console.error('❌ Could not fix consolidation JSON either:', fixError);
                    throw fixError;
                }
            }
        } else {
            console.error('❌ Unexpected content type in consolidation response:', content.type);
        }

        throw new Error('Failed to generate consolidated regulation JSON');
    }

    private validateAgainstSchema(data: any): boolean {
        const validate = this.ajv.compile(this.schema);
        const isValid = validate(data);

        if (!isValid && validate.errors) {
            console.error('📋 Detailed validation errors:');
            validate.errors.forEach((error, index) => {
                console.error(`${index + 1}. ${error.instancePath || 'root'}: ${error.message}`);
                if (error.data !== undefined) {
                    console.error(`   Data: ${JSON.stringify(error.data)}`);
                }
                if (error.params) {
                    console.error(`   Params: ${JSON.stringify(error.params)}`);
                }
            });
        }

        return isValid;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: tsx scripts/convert-regulation-pdf.ts <input-pdf> <output-json>');
        console.log('Example: tsx scripts/convert-regulation-pdf.ts ./regulation.pdf ./regulation.json');
        process.exit(1);
    }

    const [inputPath, outputPath] = args;

    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('❌ ANTHROPIC_API_KEY environment variable is required');
        process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const converter = new RegulationConverter();

    try {
        await converter.convertPdfToJson(inputPath, outputPath);
        console.log('🎉 Conversion completed successfully!');
    } catch (error) {
        console.error('💥 Conversion failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 