import axios from 'axios';
import { env } from '@/env.mjs';

const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_RERANK_MODEL = 'rerank-1';
const VOYAGE_API_BASE_URL = env.VOYAGE_API_BASE_URL;
const VOYAGE_API_KEY = env.VOYAGE_API_KEY;
const BATCH_SIZE = 80;

if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not set in the environment variables');
}

interface EmbeddingResponse {
    object: string;
    data: {
        object: string;
        embedding: number[];
        index: number;
    }[];
    model: string;
    usage: {
        total_tokens: number;
    };
}

export async function getEmbeddings(documents: string[]): Promise<number[][]> {
    const batches = Math.ceil(documents.length / BATCH_SIZE);
    const embeddings = [];

    console.log(`Processing ${documents.length} documents in ${batches} batches`);
    for (let i = 0; i < batches; i++) {
        console.log(`Processing batch ${i + 1} of ${batches}`);
        const batch = documents.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const batchEmbeddings = await getEmbeddingsForBatch(batch);
        embeddings.push(...batchEmbeddings);
    }

    console.log(`Processed ${embeddings.length} embeddings`);
    return embeddings;
}

async function getEmbeddingsForBatch(documents: string[]): Promise<number[][]> {
    if (documents.length > BATCH_SIZE) {
        throw new Error(`Batch size of ${documents.length} is greater than the maximum allowed size of ${BATCH_SIZE}`);
    }
    try {
        const response = await axios.post<EmbeddingResponse>(
            `${VOYAGE_API_BASE_URL}/embeddings`,
            {
                input: documents,
                model: VOYAGE_MODEL,
            },
            {
                headers: {
                    'Authorization': `Bearer ${VOYAGE_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data.data.map(d => d.embedding);
    } catch (error) {
        console.error('Error getting embeddings:', error);
        throw error;
    }
}

interface RerankResponse {
    object: string;
    data: {
        relevance_score: number;
        index: number;
    }[];
    model: string;
    usage: {
        total_tokens: number;
    };
}

export async function rerankDocuments(query: string, documents: string[]): Promise<RerankResponse> {
    try {
        const response = await axios.post<RerankResponse>(
            `${VOYAGE_API_BASE_URL}/rerank`,
            {
                query,
                documents,
                model: VOYAGE_RERANK_MODEL,
            },
            {
                headers: {
                    'Authorization': `Bearer ${VOYAGE_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error reranking documents:', error);
        throw error;
    }
}
