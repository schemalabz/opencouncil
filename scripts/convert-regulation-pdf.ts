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
            const chunks = this.splitTextIntoChunks(pdfData.text, 15000); // ~15k chars per chunk
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

CRITICAL: Return ONLY a valid JSON object with this exact structure (no explanatory text, no markdown formatting):
{
  "chapters": [
    {
      "num": 1,
      "id": "chapter_id",
      "title": "Chapter Title",
      "summary": "Brief summary of chapter content",
      "preludeBody": "Optional introductory text with possible {REF:id} references",
      "articles": [
        {
          "num": 1,
          "id": "article_id", 
          "title": "Article Title",
          "summary": "Brief summary",
          "body": "Full article text with {REF:id} references where appropriate"
        }
      ]
    }
  ],
  "geosets": [
    {
      "id": "geoset_id",
      "name": "GeoSet Name",
      "description": "Description of this location group",
      "geometries": [
        {
          "id": "geometry_id",
          "name": "Location Name",
          "type": "point|circle|polygon", 
          "description": "Address or description",
          "geojson": {
            "type": "Point|Polygon",
            "coordinates": "Will be added later during geocoding"
          }
        }
      ]
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
                }
            ]
        });

        try {
            const content = response.content[0];
            if (content.type === 'text') {
                console.log(`🔍 Raw response for chunk ${chunkIndex + 1}:`, content.text.substring(0, 500) + '...');

                // Clean the response text and extract JSON more carefully
                let cleanText = content.text;

                // Remove markdown code blocks
                cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

                // Find the JSON object more precisely
                const jsonStartMatch = cleanText.match(/\{/);
                if (jsonStartMatch) {
                    let braceCount = 0;
                    let jsonStart = jsonStartMatch.index!;
                    let jsonEnd = -1;

                    for (let i = jsonStart; i < cleanText.length; i++) {
                        if (cleanText[i] === '{') braceCount++;
                        else if (cleanText[i] === '}') braceCount--;

                        if (braceCount === 0) {
                            jsonEnd = i + 1;
                            break;
                        }
                    }

                    if (jsonEnd > jsonStart) {
                        const jsonString = cleanText.substring(jsonStart, jsonEnd);
                        console.log(`✅ Found JSON in chunk ${chunkIndex + 1}, attempting to parse...`);

                        try {
                            const parsed = JSON.parse(jsonString);
                            console.log(`✅ Successfully parsed chunk ${chunkIndex + 1}:`, {
                                chapters: parsed.chapters?.length || 0,
                                geosets: parsed.geosets?.length || 0
                            });
                            return parsed;
                        } catch (parseError) {
                            console.error(`❌ JSON parse error for chunk ${chunkIndex + 1}:`, parseError);
                            console.error('Extracted JSON string (first 500 chars):', jsonString.substring(0, 500));
                        }
                    } else {
                        console.error(`❌ Could not find complete JSON object in chunk ${chunkIndex + 1}`);
                        console.log('Response might be truncated. Full response length:', cleanText.length);

                        // Try to salvage what we can by looking for partial structure
                        const partialMatch = cleanText.match(/\{[\s\S]*$/);
                        if (partialMatch) {
                            console.log('⚠️  Attempting to parse partial JSON...');
                            // Add basic closing for common incomplete structures
                            let partialJson = partialMatch[0];
                            if (!partialJson.includes('"geosets"')) {
                                partialJson = partialJson.replace(/,?\s*$/, ', "geosets": []}');
                            }
                            try {
                                const parsed = JSON.parse(partialJson);
                                console.log(`✅ Successfully parsed partial chunk ${chunkIndex + 1}:`, {
                                    chapters: parsed.chapters?.length || 0,
                                    geosets: parsed.geosets?.length || 0
                                });
                                return parsed;
                            } catch (partialError) {
                                console.log('❌ Could not parse partial JSON either');
                            }
                        }
                    }
                } else {
                    console.error(`❌ No JSON found in response for chunk ${chunkIndex + 1}`);
                    console.error('Full response:', content.text);
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
            return { chapters: [], geosets: [] };
        }
    }

    private async consolidateChunks(processedChunks: any[], fullText: string): Promise<RegulationData> {
        console.log('🧠 Using Claude to consolidate and structure final regulation...');

        // Combine all extracted data
        const allChapters = processedChunks.flatMap(chunk => chunk.chapters || []);
        const allGeosets = processedChunks.flatMap(chunk => chunk.geosets || []);

        const consolidationPrompt = `You are finalizing a legal regulation conversion to JSON format that follows this EXACT schema structure:

{
  "title": "Regulation Title",
  "contactEmail": "municipality@example.com", 
  "sources": [{"title": "Original PDF", "url": "#"}],
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
2. Each geoset groups related geographic locations with individual geometry objects
3. Each geometry needs: type (point/circle/polygon), name, id, description, geojson
4. Use placeholder coordinates for geojson (we'll geocode later) - use Athens area coordinates (lat ~37.97, lng ~23.72)
5. Group locations logically: "prohibited_areas", "parking_zones", "speed_limit_areas", etc.
6. Articles should reference geosets/geometries using {REF:id} syntax

EXTRACTED DATA:
Chapters: ${JSON.stringify(allChapters, null, 2)}
GeoSets: ${JSON.stringify(allGeosets, null, 2)}

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

CRITICAL: Return ONLY the complete regulation JSON that validates against the schema (no explanatory text, no markdown formatting, just the JSON object).`;

        const response = await anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 12000,
            messages: [
                {
                    role: 'user',
                    content: consolidationPrompt
                }
            ]
        });

        const content = response.content[0];
        if (content.type === 'text') {
            console.log('🔍 Consolidation response preview:', content.text.substring(0, 500) + '...');

            // Clean the response text and extract JSON more carefully
            let cleanText = content.text;

            // Remove markdown code blocks
            cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // Find the JSON object more precisely
            const jsonStartMatch = cleanText.match(/\{/);
            if (jsonStartMatch) {
                let braceCount = 0;
                let jsonStart = jsonStartMatch.index!;
                let jsonEnd = -1;

                for (let i = jsonStart; i < cleanText.length; i++) {
                    if (cleanText[i] === '{') braceCount++;
                    else if (cleanText[i] === '}') braceCount--;

                    if (braceCount === 0) {
                        jsonEnd = i + 1;
                        break;
                    }
                }

                if (jsonEnd > jsonStart) {
                    const jsonString = cleanText.substring(jsonStart, jsonEnd);
                    try {
                        console.log('✅ Found JSON in consolidation response, attempting to parse...');
                        const parsed = JSON.parse(jsonString);
                        console.log('✅ Successfully parsed consolidated regulation');
                        return parsed;
                    } catch (error) {
                        console.error('❌ Failed to parse consolidated JSON:', error);
                        console.error('Extracted JSON string (first 1000 chars):', jsonString.substring(0, 1000) + '...');
                        throw error;
                    }
                } else {
                    console.error('❌ Could not find complete JSON object in consolidation response');
                }
            } else {
                console.error('❌ No JSON found in consolidation response');
                console.error('Full consolidation response:', content.text);
            }
        } else {
            console.error('❌ Unexpected content type in consolidation response:', content.type);
        }

        throw new Error('Failed to generate consolidated regulation JSON');
    }

    private validateAgainstSchema(data: any): boolean {
        const validate = this.ajv.compile(this.schema);
        return validate(data);
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