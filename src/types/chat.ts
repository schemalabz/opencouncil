import { SearchResultDetailed } from '@/lib/search/types';

export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    subjectReferences?: SearchResultDetailed[];
    done?: boolean;
    error?: boolean;
}

export interface StreamData {
    id: string;
    role: 'assistant';
    content: string;
    done: boolean;
    subjectReferences?: SearchResultDetailed[];
    error?: boolean;
} 